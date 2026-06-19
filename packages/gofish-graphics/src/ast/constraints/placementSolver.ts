// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { getValue, getValueOffset, isValue, type MaybeValue } from "../data";
import type { Anchor } from "../dims";
import type { AlignConstraint, AlignAxisSpec } from "./align";
import type { DistributeConstraint } from "./distribute";
import type { GridConstraint } from "./grid";
import type { NestConstraint } from "./nest";
import type { PositionConstraint } from "./position";
import type { SpanConstraint } from "./span";
import type { Axis, AlignAnchor, ConstraintPosScales } from "./shared";
import { BBox, type BBoxFacet } from "./bbox";
import type {
  NodeId,
  PlacementFact,
  PlacementPin,
  PlacementProgram,
  PlacementRelation,
  PlacementSpan,
  PlacementWeakPin,
} from "./placementFacts";
import {
  anchorExpr,
  emptyPlacementProgram,
  pinFact,
  relationFact,
  weakPinFact,
} from "./placementFacts";

type PlacementConstraint =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | SpanConstraint
  | NestConstraint
  | GridConstraint;

/** One emitted span extent: the target owns both edges on one axis. */
interface SpanPlacement {
  name: string;
  target: Placeable;
  axis: Axis;
  owned: { min: number; max: number };
  owner: string;
}

interface SpanGroup {
  name: string;
  target: Placeable;
  axis: Axis;
  bbox: BBox;
  owner: string;
}

interface SpanExtent extends PlacementSpan {
  size: number;
}

interface PlacementRelationRequest {
  axis: Axis;
  from: { name: string; anchor: AlignAnchor };
  to: { name: string; anchor: AlignAnchor };
  gap: number;
  owner: string;
}

export interface LoweredPlacement {
  program: PlacementProgram;
  spanExtents: SpanExtent[];
}

export interface PlacementConflict {
  axis: Axis;
  owner: string;
  priorOwner: string;
  asserted: number;
  implied: number;
}

/** A raw placement-system coordinate after datum values have been elaborated
 *  through the layer's data→pixel scale. Undefined means a datum coordinate had
 *  no scale in this scope, so the fact cannot be emitted. */
export type PlacementCoordinate = number | undefined;

const TOLERANCE = 1e-6;
const AXIS_INDICES = [0, 1] as const;
const POSITION_AXES = ["x", "y"] as const;

const axisIndex = (axis: Axis): 0 | 1 => (axis === "x" ? 0 : 1);
const axisName = (axis: 0 | 1): Axis => (axis === 0 ? "x" : "y");
const placementKey = (axis: 0 | 1, name: string): string => `${axis}:${name}`;

const BOX_ANCHOR: Record<AlignAnchor, Anchor> = {
  start: "min",
  middle: "center",
  end: "max",
  baseline: "baseline",
};

function anchorOffset(
  target: Placeable,
  axis: Axis,
  anchor: AlignAnchor,
  spannedSize: number | undefined
): number | undefined {
  if (spannedSize !== undefined) {
    if (anchor === "start" || anchor === "baseline") return 0;
    return anchor === "middle"
      ? Math.abs(spannedSize) / 2
      : Math.abs(spannedSize);
  }

  const local = target.localAnchor?.(axis, BOX_ANCHOR[anchor]);
  const localMin = target.localAnchor?.(axis, "min");
  if (local !== undefined && localMin !== undefined) return local - localMin;

  const size = target.dims[axisIndex(axis)].size;
  if (anchor === "baseline") return undefined;
  if (anchor === "start") return 0;
  if (size === undefined) return undefined;
  return anchor === "middle" ? Math.abs(size) / 2 : Math.abs(size);
}

export function compilePlacementCoordinate(
  coordinate: MaybeValue<number>,
  scale: ((value: number) => number) | undefined
): PlacementCoordinate {
  if (!isValue(coordinate)) return coordinate;
  if (scale === undefined) return undefined;
  return scale(getValue(coordinate)!) + getValueOffset(coordinate);
}

function resolveCoordinate(
  coordinate: MaybeValue<number>,
  scale: ((value: number) => number) | undefined
): number | undefined {
  return compilePlacementCoordinate(coordinate, scale);
}

function emitSpanPlacements(
  constraint: SpanConstraint,
  targets: Map<string, Placeable>,
  posScales: ConstraintPosScales | undefined,
  owner: string
): SpanPlacement[] {
  const out: SpanPlacement[] = [];
  const emitAxis = (
    axis: Axis,
    span: [MaybeValue<number>, MaybeValue<number>] | undefined
  ) => {
    if (span === undefined) return;
    const min = resolveCoordinate(span[0], posScales?.[axisIndex(axis)]);
    const max = resolveCoordinate(span[1], posScales?.[axisIndex(axis)]);
    if (min === undefined || max === undefined) return;
    for (const child of constraint.children) {
      const target = targets.get(child.name);
      if (target)
        out.push({
          name: child.name,
          target,
          axis,
          owned: { min, max },
          owner,
        });
    }
  };
  emitAxis("x", constraint.x);
  emitAxis("y", constraint.y);
  return out;
}

function collectSpanExtents(placements: SpanPlacement[]): SpanExtent[] {
  const byTarget = new Map<Placeable, [SpanGroup?, SpanGroup?]>();
  const groups: SpanGroup[] = [];
  for (const placement of placements) {
    const idx = axisIndex(placement.axis);
    let axes = byTarget.get(placement.target);
    if (!axes) {
      axes = [undefined, undefined];
      byTarget.set(placement.target, axes);
    }
    let group = axes[idx];
    if (!group) {
      group = {
        name: placement.name,
        target: placement.target,
        axis: placement.axis,
        bbox: new BBox(),
        owner: placement.owner,
      };
      axes[idx] = group;
      groups.push(group);
    }

    for (const [facet, value] of Object.entries(placement.owned) as [
      BBoxFacet,
      number,
    ][]) {
      const conflict = group.bbox.add(facet, value, placement.owner);
      if (conflict) {
        throw new Error(
          `Constraint span conflict on ${placement.axis}: ${conflict.owner} ` +
            `asserts ${conflict.facet}=${conflict.asserted}, but ` +
            `${conflict.priorOwner} implies ${conflict.implied}`
        );
      }
    }
  }

  return groups.flatMap((group) => {
    const min = group.bbox.read("min");
    const max = group.bbox.read("max");
    if (min === undefined || max === undefined) return [];
    const size = max - min;
    return [
      {
        type: "span",
        name: group.name,
        axis: group.axis,
        min,
        max,
        size,
        owner: group.owner,
      },
    ];
  });
}

function normalizedAnchors(spec: AlignAxisSpec, count: number): AlignAnchor[] {
  if (!Array.isArray(spec)) return new Array<AlignAnchor>(count).fill(spec);
  if (spec.length !== count) {
    throw new Error(
      `Constraint.align: anchor array length ${spec.length} must match number of children ${count}`
    );
  }
  return spec;
}

function compareRank(a: PlacementWeakPin, b: PlacementWeakPin): number {
  return (
    a.rank[0] - b.rank[0] ||
    a.rank[1] - b.rank[1] ||
    a.rank[2] - b.rank[2] ||
    a.rank[3].localeCompare(b.rank[3])
  );
}

function alignAnchorRank(anchor: AlignAnchor): number {
  if (anchor === "middle") return 0;
  if (anchor === "start") return 1;
  if (anchor === "end") return 2;
  return 3;
}

function alignFallback(
  anchor: AlignAnchor,
  axis: 0 | 1,
  sizes: [number, number],
  posScales: ConstraintPosScales | undefined
): number {
  if (anchor === "middle")
    return Number.isFinite(sizes[axis]) ? sizes[axis] / 2 : 0;
  if (posScales?.[axis]) return posScales[axis]!(0);
  if (anchor === "end" && Number.isFinite(sizes[axis])) return sizes[axis];
  return 0;
}

function isDataPositionedAlignTarget(
  target: Placeable | undefined,
  anchor: AlignAnchor,
  axis: 0 | 1,
  posScales: ConstraintPosScales | undefined
): boolean {
  if (anchor === "middle" || posScales?.[axis] === undefined) return false;
  const placement =
    typeof target?.placementOn === "function"
      ? target.placementOn(axis)
      : undefined;
  return placement !== undefined && placement.tag !== "free";
}

class PlacementProgramBuilder {
  readonly program = emptyPlacementProgram();

  constructor(
    private readonly targets: Map<string, Placeable>,
    private readonly spanExtents: Map<string, SpanExtent>
  ) {}

  private facts(axis: Axis): PlacementFact[] {
    return this.program.axes[axisIndex(axis)];
  }

  private target(name: string): Placeable | undefined {
    return this.targets.get(name);
  }

  private spannedSize(axis: Axis, name: string): number | undefined {
    return this.spanExtents.get(placementKey(axisIndex(axis), name))?.size;
  }

  pin(
    axis: Axis,
    name: string,
    anchor: AlignAnchor,
    value: number,
    owner: string
  ): void {
    const target = this.target(name);
    if (!target) return;
    const offset = anchorOffset(
      target,
      axis,
      anchor,
      this.spannedSize(axis, name)
    );
    if (offset === undefined) return;
    this.facts(axis).push(
      pinFact(anchorExpr(name, axis, "start"), value - offset, owner)
    );
  }

  weakPin(
    axis: Axis,
    name: string,
    anchor: AlignAnchor,
    value: number,
    kindRank: number,
    arityRank: number,
    anchorRank: number,
    signature: string,
    owner: string
  ): void {
    const target = this.target(name);
    if (!target) return;
    const offset = anchorOffset(
      target,
      axis,
      anchor,
      this.spannedSize(axis, name)
    );
    if (offset === undefined) return;
    this.facts(axis).push(
      weakPinFact(
        anchorExpr(name, axis, "start"),
        value - offset,
        [kindRank, arityRank, anchorRank, signature],
        owner
      )
    );
  }

  relate(request: PlacementRelationRequest): void {
    const fromTarget = this.target(request.from.name);
    const toTarget = this.target(request.to.name);
    if (!fromTarget || !toTarget) return;
    const fromOffset = anchorOffset(
      fromTarget,
      request.axis,
      request.from.anchor,
      this.spannedSize(request.axis, request.from.name)
    );
    const toOffset = anchorOffset(
      toTarget,
      request.axis,
      request.to.anchor,
      this.spannedSize(request.axis, request.to.name)
    );
    if (fromOffset === undefined || toOffset === undefined) return;
    this.facts(request.axis).push(
      relationFact(
        anchorExpr(request.from.name, request.axis, "start"),
        anchorExpr(request.to.name, request.axis, "start"),
        fromOffset + request.gap - toOffset,
        request.owner
      )
    );
  }

  span(extent: SpanExtent): void {
    this.facts(extent.axis).push(extent);
  }
}

function solveAxis(
  axis: Axis,
  facts: PlacementFact[]
): { positions: Map<NodeId, number>; conflicts: PlacementConflict[] } {
  const relations = facts.filter(
    (fact): fact is PlacementRelation => fact.type === "relation"
  );
  const pins = facts.filter(
    (fact): fact is PlacementPin | PlacementSpan =>
      fact.type === "pin" || fact.type === "span"
  );
  const weakPins = facts.filter(
    (fact): fact is PlacementWeakPin => fact.type === "weak-pin"
  );
  const participants = new Set<NodeId>();
  for (const fact of facts) {
    if (fact.type === "pin" || fact.type === "weak-pin")
      participants.add(fact.expr.node);
    else if (fact.type === "relation") {
      participants.add(fact.from.node);
      participants.add(fact.to.node);
    } else participants.add(fact.name);
  }

  const adjacency = new Map<
    NodeId,
    { node: NodeId; delta: number; owner: string }[]
  >();
  const addEdge = (from: NodeId, to: NodeId, delta: number, owner: string) => {
    const list = adjacency.get(from) ?? [];
    list.push({ node: to, delta, owner });
    adjacency.set(from, list);
  };
  for (const relation of relations) {
    addEdge(
      relation.from.node,
      relation.to.node,
      relation.offset,
      relation.owner
    );
    addEdge(
      relation.to.node,
      relation.from.node,
      -relation.offset,
      relation.owner
    );
  }

  const relative = new Map<NodeId, number>();
  const componentOf = new Map<NodeId, number>();
  const components: NodeId[][] = [];
  const conflicts: PlacementConflict[] = [];

  for (const start of [...participants].sort()) {
    if (relative.has(start)) continue;
    const component = components.length;
    const nodes: NodeId[] = [];
    const queue: NodeId[] = [start];
    relative.set(start, 0);
    componentOf.set(start, component);
    while (queue.length > 0) {
      const current = queue.shift()!;
      nodes.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        const expected = relative.get(current)! + edge.delta;
        const prior = relative.get(edge.node);
        if (prior === undefined) {
          relative.set(edge.node, expected);
          componentOf.set(edge.node, component);
          queue.push(edge.node);
        } else if (Math.abs(prior - expected) > TOLERANCE) {
          conflicts.push({
            axis,
            owner: edge.owner,
            priorOwner: "relation graph",
            asserted: expected,
            implied: prior,
          });
        }
      }
    }
    components.push(nodes);
  }

  const offsets = new Map<number, { value: number; owner: string }>();
  const pinNode = (pin: PlacementPin | PlacementWeakPin | PlacementSpan) =>
    pin.type === "span" ? pin.name : pin.expr.node;
  const pinValue = (pin: PlacementPin | PlacementWeakPin | PlacementSpan) =>
    pin.type === "span" ? pin.min : pin.value;
  const applyPin = (pin: PlacementPin | PlacementWeakPin | PlacementSpan) => {
    const node = pinNode(pin);
    const component = componentOf.get(node);
    const rel = relative.get(node);
    if (component === undefined || rel === undefined) return;
    const assertedOffset = pinValue(pin) - rel;
    const prior = offsets.get(component);
    if (prior === undefined) {
      offsets.set(component, { value: assertedOffset, owner: pin.owner });
    } else if (Math.abs(prior.value - assertedOffset) > TOLERANCE) {
      conflicts.push({
        axis,
        owner: pin.owner,
        priorOwner: prior.owner,
        asserted: pinValue(pin),
        implied: rel + prior.value,
      });
    }
  };
  for (const pin of pins) applyPin(pin);

  for (let component = 0; component < components.length; component++) {
    if (offsets.has(component)) continue;
    const weak = weakPins
      .filter((pin) => componentOf.get(pin.expr.node) === component)
      .sort(compareRank)[0];
    if (weak) applyPin(weak);
    else {
      const first = [...components[component]].sort()[0];
      offsets.set(component, {
        value: -(relative.get(first) ?? 0),
        owner: "default-origin",
      });
    }
  }

  const positions = new Map<NodeId, number>();
  for (const [node, rel] of relative) {
    const component = componentOf.get(node)!;
    positions.set(node, rel + offsets.get(component)!.value);
  }
  return { positions, conflicts };
}

export function lowerPlacementConstraints(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales
): LoweredPlacement {
  const authoritative = new Set<string>();
  const initiallyPlaced = new Set<string>();
  const positionPinned = new Set<string>();
  const spanPinned = new Set<string>();

  for (const [name, target] of targets) {
    for (const axis of AXIS_INDICES) {
      if (target.dims[axis].min !== undefined)
        initiallyPlaced.add(placementKey(axis, name));
    }
  }

  const spanPlacements = constraints.flatMap((constraint, constraintIndex) =>
    constraint.type === "span"
      ? emitSpanPlacements(
          constraint,
          targets,
          posScales,
          `span[${constraintIndex}]`
        )
      : []
  );
  const spanExtents = collectSpanExtents(spanPlacements);
  const spanExtentByKey = new Map<string, SpanExtent>();
  for (const extent of spanExtents) {
    const key = placementKey(axisIndex(extent.axis), extent.name);
    spanExtentByKey.set(key, extent);
    spanPinned.add(key);
  }

  const builder = new PlacementProgramBuilder(targets, spanExtentByKey);
  for (const extent of spanExtents) builder.span(extent);

  for (const constraint of constraints) {
    if (constraint.type !== "position" || !constraint.override) continue;
    for (const child of constraint.children) {
      if (constraint.x !== undefined)
        authoritative.add(placementKey(0, child.name));
      if (constraint.y !== undefined)
        authoritative.add(placementKey(1, child.name));
    }
  }
  for (const constraint of constraints) {
    if (constraint.type !== "position") continue;
    for (const axis of POSITION_AXES) {
      const coordinate = constraint[axis];
      if (coordinate === undefined) continue;
      const idx = axisIndex(axis);
      const value = resolveCoordinate(coordinate, posScales?.[idx]);
      if (value === undefined) continue;
      for (const child of constraint.children) {
        positionPinned.add(placementKey(idx, child.name));
      }
    }
  }

  // A node that self-placed during its own layout is a hard boundary condition,
  // except where an authoritative position constraint explicitly owns the axis.
  for (const [name] of targets) {
    for (const axis of AXIS_INDICES) {
      const key = placementKey(axis, name);
      if (!initiallyPlaced.has(key) || authoritative.has(key)) continue;
      const min = targets.get(name)!.dims[axis].min;
      if (min !== undefined)
        builder.pin(axisName(axis), name, "start", min, "self-placement");
    }
  }

  constraints.forEach((constraint, constraintIndex) => {
    const owner = `${constraint.type}[${constraintIndex}]`;

    if (constraint.type === "span") return;

    if (constraint.type === "position") {
      const emit = (axis: Axis, coordinate: MaybeValue<number> | undefined) => {
        if (coordinate === undefined) return;
        const value = resolveCoordinate(
          coordinate,
          posScales?.[axisIndex(axis)]
        );
        if (value === undefined) return;
        for (const child of constraint.children) {
          const target = targets.get(child.name);
          if (!target) continue;
          const alreadyPlaced = initiallyPlaced.has(
            placementKey(axisIndex(axis), child.name)
          );
          if (alreadyPlaced && !constraint.override) continue;
          builder.pin(axis, child.name, constraint.anchor, value, owner);
        }
      };
      emit("x", constraint.x);
      emit("y", constraint.y);
      return;
    }

    if (constraint.type === "align") {
      const emit = (axis: Axis, spec: AlignAxisSpec | undefined) => {
        if (spec === undefined) return;
        const children = constraint.children.filter((child) =>
          targets.has(child.name)
        );
        if (children.length === 0) return;
        const anchors = normalizedAnchors(spec, children.length);

        const entries = children.map((child, index) => ({
          child,
          anchor: anchors[index],
        }));
        const idx = axisIndex(axis);
        const isPinned = (name: string) =>
          initiallyPlaced.has(placementKey(idx, name)) ||
          positionPinned.has(placementKey(idx, name)) ||
          spanPinned.has(placementKey(idx, name));

        // Preserve legacy align's two-phase semantics:
        // 1. the first already-placed target can define the shared baseline;
        // 2. already-placed or data-positioned targets are not themselves moved.
        //
        // Keeping these separate matters for chart+legend layers: the chart may
        // be the baseline source while the legend is the only target align
        // writes. Faceted scatter panels, where every panel is already
        // data-positioned, still contribute no write targets.
        const source = entries.find(({ child }) => isPinned(child.name));
        const movable = entries.filter(({ child, anchor }) => {
          if (isPinned(child.name)) return false;
          const target = targets.get(child.name);
          return !isDataPositionedAlignTarget(target, anchor, idx, posScales);
        });
        if (movable.length === 0) return;

        if (source) {
          for (const target of movable) {
            builder.relate({
              axis,
              from: { name: source.child.name, anchor: source.anchor },
              to: { name: target.child.name, anchor: target.anchor },
              gap: 0,
              owner,
            });
          }
          return;
        }

        const aligned = movable;
        for (let i = 1; i < aligned.length; i++) {
          builder.relate({
            axis,
            from: { name: aligned[0].child.name, anchor: aligned[0].anchor },
            to: { name: aligned[i].child.name, anchor: aligned[i].anchor },
            gap: 0,
            owner,
          });
        }
        const firstAnchor = aligned[0].anchor;
        builder.weakPin(
          axis,
          aligned[0].child.name,
          firstAnchor,
          alignFallback(firstAnchor, idx, sizes, posScales),
          1,
          aligned.length,
          alignAnchorRank(firstAnchor),
          `align:${axis}:${firstAnchor}:${aligned
            .map(({ child }) => child.name)
            .join(",")}`,
          owner
        );
      };
      emit("x", constraint.x);
      emit("y", constraint.y);
      return;
    }

    if (constraint.type === "distribute") {
      const children = constraint.children.filter((child) =>
        targets.has(child.name)
      );
      const ordered =
        constraint.order === "reverse" ? [...children].reverse() : children;
      if (ordered.length === 0) return;
      for (let i = 1; i < ordered.length; i++) {
        // A chain edge whose endpoints both arrived pre-positioned was a
        // consistency check/no-op in the legacy walk (not an owning relation).
        // Preserve that boundary: confluence governs the unknown positions.
        const idx = axisIndex(constraint.dir);
        if (
          initiallyPlaced.has(placementKey(idx, ordered[i - 1].name)) &&
          initiallyPlaced.has(placementKey(idx, ordered[i].name))
        )
          continue;
        if (constraint.mode === "center") {
          builder.relate({
            axis: constraint.dir,
            from: { name: ordered[i - 1].name, anchor: "middle" },
            to: { name: ordered[i].name, anchor: "middle" },
            gap: constraint.spacing,
            owner,
          });
        } else {
          builder.relate({
            axis: constraint.dir,
            from: { name: ordered[i - 1].name, anchor: "end" },
            to: { name: ordered[i].name, anchor: "start" },
            gap: constraint.spacing,
            owner,
          });
        }
      }
      builder.weakPin(
        constraint.dir,
        ordered[0].name,
        constraint.mode === "center" ? "middle" : "start",
        0,
        2,
        ordered.length,
        constraint.mode === "center" ? 0 : 1,
        `distribute:${constraint.dir}:${constraint.mode}:${ordered
          .map((child) => child.name)
          .join(",")}`,
        owner
      );
      return;
    }

    if (constraint.type === "nest") {
      const [outer, inner] = constraint.children;
      if (constraint.x !== undefined)
        builder.relate({
          axis: "x",
          from: { name: outer.name, anchor: "middle" },
          to: { name: inner.name, anchor: "middle" },
          gap: 0,
          owner,
        });
      if (constraint.y !== undefined)
        builder.relate({
          axis: "y",
          from: { name: outer.name, anchor: "middle" },
          to: { name: inner.name, anchor: "middle" },
          gap: 0,
          owner,
        });
      return;
    }

    const rows = Math.ceil(constraint.children.length / constraint.numCols);
    const cellWidth =
      (sizes[0] - constraint.xSpacing * (constraint.numCols - 1)) /
      constraint.numCols;
    const cellHeight = (sizes[1] - constraint.ySpacing * (rows - 1)) / rows;
    constraint.children.forEach((child, index) => {
      const column = index % constraint.numCols;
      const row = Math.floor(index / constraint.numCols);
      builder.pin(
        "x",
        child.name,
        "middle",
        column * (cellWidth + constraint.xSpacing) + cellWidth / 2,
        owner
      );
      builder.pin(
        "y",
        child.name,
        "middle",
        row * (cellHeight + constraint.ySpacing) + cellHeight / 2,
        owner
      );
    });
  });

  return { program: builder.program, spanExtents };
}

export function solvePlacementConstraints(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales
): PlacementConflict[] {
  const lowered = lowerPlacementConstraints(
    constraints,
    targets,
    sizes,
    posScales
  );
  const spanExtentByKey = new Map<string, SpanExtent>();
  for (const extent of lowered.spanExtents) {
    spanExtentByKey.set(
      placementKey(axisIndex(extent.axis), extent.name),
      extent
    );
  }

  const results = [
    solveAxis("x", lowered.program.axes[0]),
    solveAxis("y", lowered.program.axes[1]),
  ] as const;
  const conflicts = results.flatMap((result) => result.conflicts);
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    throw new Error(
      `Constraint placement conflict on ${conflict.axis}: ${conflict.owner} ` +
        `asserts ${conflict.asserted}, but ${conflict.priorOwner} implies ` +
        `${conflict.implied}`
    );
  }

  results.forEach((result, axisIndexValue) => {
    const axis = axisIndexValue as 0 | 1;
    const axisLabel = axisName(axis);
    for (const [name, min] of result.positions) {
      const target = targets.get(name);
      if (!target) continue;
      const span = spanExtentByKey.get(placementKey(axis, name));
      if (span && target.setExtent) {
        target.setExtent(axisLabel, { min, max: min + span.size }, span.owner);
      } else if (target.pinAnchor) target.pinAnchor(axis, min, "min");
      else target.place(axis, min, "min");
    }
  });
  return conflicts;
}
