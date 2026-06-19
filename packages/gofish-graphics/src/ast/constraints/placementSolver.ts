// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { getValue, getValueOffset, isValue, type MaybeValue } from "../data";
import type { Anchor } from "../dims";
import type { AlignConstraint } from "./align";
import { lowerAlignPlacement } from "./align";
import type { DistributeConstraint } from "./distribute";
import { lowerDistributePlacement } from "./distribute";
import type { GridConstraint } from "./grid";
import { lowerGridPlacement } from "./grid";
import type { NestConstraint } from "./nest";
import { lowerNestPlacement } from "./nest";
import type { PositionConstraint } from "./position";
import { lowerPositionPlacement } from "./position";
import type { SpanConstraint, SpanExtent } from "./span";
import { collectSpanExtents, lowerSpanPlacements } from "./span";
import type { Axis, AlignAnchor, ConstraintPosScales } from "./shared";
import type {
  NodeId,
  PlacementFactEmitter,
  PlacementFact,
  PlacementPin,
  PlacementProgram,
  PlacementRelation,
  PlacementRelationRequest,
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

function compareRank(a: PlacementWeakPin, b: PlacementWeakPin): number {
  return (
    a.rank[0] - b.rank[0] ||
    a.rank[1] - b.rank[1] ||
    a.rank[2] - b.rank[2] ||
    a.rank[3].localeCompare(b.rank[3])
  );
}

class PlacementProgramBuilder implements PlacementFactEmitter {
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

class PlacementOwnershipPlan {
  private readonly authoritative = new Set<string>();
  private readonly initiallyPlaced = new Set<string>();
  private readonly positionPinned = new Set<string>();
  private readonly spanPinned = new Set<string>();

  constructor(
    targets: Map<string, Placeable>,
    constraints: PlacementConstraint[],
    posScales: ConstraintPosScales | undefined
  ) {
    for (const [name, target] of targets) {
      for (const axis of AXIS_INDICES) {
        if (target.dims[axis].min !== undefined)
          this.initiallyPlaced.add(placementKey(axis, name));
      }
    }

    for (const constraint of constraints) {
      if (constraint.type !== "position") continue;
      this.notePositionConstraint(constraint, posScales);
    }
  }

  noteSpanExtent(extent: SpanExtent): void {
    this.spanPinned.add(placementKey(axisIndex(extent.axis), extent.name));
  }

  isInitiallyPlaced(axis: Axis, name: string): boolean {
    return this.initiallyPlaced.has(placementKey(axisIndex(axis), name));
  }

  isPinned(axis: Axis, name: string): boolean {
    const key = placementKey(axisIndex(axis), name);
    return (
      this.initiallyPlaced.has(key) ||
      this.positionPinned.has(key) ||
      this.spanPinned.has(key)
    );
  }

  shouldPinSelfPlacement(axis: 0 | 1, name: string): boolean {
    const key = placementKey(axis, name);
    return this.initiallyPlaced.has(key) && !this.authoritative.has(key);
  }

  private notePositionConstraint(
    constraint: PositionConstraint,
    posScales: ConstraintPosScales | undefined
  ): void {
    for (const child of constraint.children) {
      if (constraint.override) {
        if (constraint.x !== undefined)
          this.authoritative.add(placementKey(0, child.name));
        if (constraint.y !== undefined)
          this.authoritative.add(placementKey(1, child.name));
      }
    }

    for (const axis of POSITION_AXES) {
      const coordinate = constraint[axis];
      if (coordinate === undefined) continue;
      const idx = axisIndex(axis);
      const value = resolveCoordinate(coordinate, posScales?.[idx]);
      if (value === undefined) continue;
      for (const child of constraint.children) {
        this.positionPinned.add(placementKey(idx, child.name));
      }
    }
  }
}

export function lowerPlacementConstraints(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales
): LoweredPlacement {
  const ownership = new PlacementOwnershipPlan(targets, constraints, posScales);

  const spanPlacements = constraints.flatMap((constraint, constraintIndex) =>
    constraint.type === "span"
      ? lowerSpanPlacements(
          constraint,
          targets,
          `span[${constraintIndex}]`,
          (axis, coordinate) =>
            resolveCoordinate(coordinate, posScales?.[axisIndex(axis)])
        )
      : []
  );
  const spanExtents = collectSpanExtents(spanPlacements);
  const spanExtentByKey = new Map<string, SpanExtent>();
  for (const extent of spanExtents) {
    const key = placementKey(axisIndex(extent.axis), extent.name);
    spanExtentByKey.set(key, extent);
    ownership.noteSpanExtent(extent);
  }

  const builder = new PlacementProgramBuilder(targets, spanExtentByKey);
  for (const extent of spanExtents) builder.span(extent);
  const resolveAxisCoordinate = (axis: Axis, coordinate: MaybeValue<number>) =>
    resolveCoordinate(coordinate, posScales?.[axisIndex(axis)]);
  const isInitiallyPlaced = ownership.isInitiallyPlaced.bind(ownership);
  const isPinned = ownership.isPinned.bind(ownership);

  // A node that self-placed during its own layout is a hard boundary condition,
  // except where an authoritative position constraint explicitly owns the axis.
  for (const [name] of targets) {
    for (const axis of AXIS_INDICES) {
      if (!ownership.shouldPinSelfPlacement(axis, name)) continue;
      const min = targets.get(name)!.dims[axis].min;
      if (min !== undefined)
        builder.pin(axisName(axis), name, "start", min, "self-placement");
    }
  }

  constraints.forEach((constraint, constraintIndex) => {
    const owner = `${constraint.type}[${constraintIndex}]`;

    if (constraint.type === "span") return;

    if (constraint.type === "position") {
      lowerPositionPlacement(constraint, owner, {
        emitter: builder,
        targets,
        isInitiallyPlaced,
        resolveCoordinate: resolveAxisCoordinate,
      });
      return;
    }

    if (constraint.type === "align") {
      lowerAlignPlacement(constraint, owner, {
        emitter: builder,
        targets,
        sizes,
        posScales,
        axisIndex,
        isPinned,
      });
      return;
    }

    if (constraint.type === "distribute") {
      lowerDistributePlacement(constraint, owner, {
        emitter: builder,
        targets,
        isInitiallyPlaced,
      });
      return;
    }

    if (constraint.type === "nest") {
      lowerNestPlacement(constraint, owner, builder);
      return;
    }

    lowerGridPlacement(constraint, owner, sizes, builder);
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
