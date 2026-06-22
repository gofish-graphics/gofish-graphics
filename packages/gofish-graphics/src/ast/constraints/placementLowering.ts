// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import {
  getValue,
  getValueOffset,
  isDiscretePosition,
  isValue,
  type MaybeValue,
  type PositionValue,
} from "../data";
import type { AlignConstraint } from "./align";
import { lowerAlignPlacement } from "./align";
import type { DistributeConstraint } from "./distribute";
import { lowerDistributePlacement } from "./distribute";
import type { GridConstraint } from "./grid";
import { lowerGridPlacement } from "./grid";
import type { NestConstraint } from "./nest";
import { lowerNestPlacement } from "./nest";
import { PlacementProgramLowerer } from "./placementProgramLowerer";
import type { PositionConstraint } from "./position";
import { lowerPositionPlacement } from "./position";
import type { SpanConstraint, SpanExtent } from "./span";
import { collectSpanExtents, lowerSpanEdgePins } from "./span";
import { axisIndex, type Axis, type ConstraintPosScales } from "./shared";
import type { PlacementProgram } from "./placementFacts";

export type PlacementConstraint =
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

/** A raw placement-system coordinate after datum values have been elaborated
 *  through the layer's data→pixel scale. Undefined means a datum coordinate had
 *  no scale in this scope, so the fact cannot be emitted. */
export type PlacementCoordinate = number | undefined;

const AXIS_INDICES = [0, 1] as const;
const POSITION_AXES = ["x", "y"] as const;

const axisName = (axis: 0 | 1): Axis => (axis === 0 ? "x" : "y");
const placementKey = (axis: Axis, name: string): string => `${axis}:${name}`;

export function compilePlacementCoordinate(
  coordinate: PositionValue,
  scale: ((value: number) => number) | undefined,
  axisSize?: number
): PlacementCoordinate {
  if (isDiscretePosition(coordinate)) {
    if (!Number.isFinite(axisSize) || coordinate.count <= 0) return undefined;
    return (coordinate.index / coordinate.count) * axisSize!;
  }
  if (!isValue(coordinate)) return coordinate;
  if (scale === undefined) return undefined;
  return scale(getValue(coordinate)!) + getValueOffset(coordinate);
}

function resolveCoordinate(
  coordinate: PositionValue,
  scale: ((value: number) => number) | undefined,
  axisSize?: number
): number | undefined {
  return compilePlacementCoordinate(coordinate, scale, axisSize);
}

class PlacementOwnershipPlan {
  private readonly authoritative = new Set<string>();
  private readonly initiallyPlaced = new Set<string>();
  private readonly positionPinned = new Set<string>();
  private readonly spanPinned = new Set<string>();
  private readonly sizes: [number, number];

  constructor(
    targets: Map<string, Placeable>,
    constraints: PlacementConstraint[],
    posScales: ConstraintPosScales | undefined,
    sizes: [number, number]
  ) {
    this.sizes = sizes;
    for (const [name, target] of targets) {
      for (const axis of AXIS_INDICES) {
        if (target.dims[axis].min !== undefined)
          this.initiallyPlaced.add(placementKey(axisName(axis), name));
      }
    }

    for (const constraint of constraints) {
      if (constraint.type !== "position") continue;
      this.notePositionConstraint(constraint, posScales);
    }
  }

  noteSpanExtent(extent: SpanExtent): void {
    this.spanPinned.add(placementKey(extent.axis, extent.name));
  }

  isInitiallyPlaced(axis: Axis, name: string): boolean {
    return this.initiallyPlaced.has(placementKey(axis, name));
  }

  isPinned(axis: Axis, name: string): boolean {
    const key = placementKey(axis, name);
    return (
      this.initiallyPlaced.has(key) ||
      this.positionPinned.has(key) ||
      this.spanPinned.has(key)
    );
  }

  shouldPinSelfPlacement(axis: 0 | 1, name: string): boolean {
    const key = placementKey(axisName(axis), name);
    return this.initiallyPlaced.has(key) && !this.authoritative.has(key);
  }

  private notePositionConstraint(
    constraint: PositionConstraint,
    posScales: ConstraintPosScales | undefined
  ): void {
    for (const child of constraint.children) {
      if (constraint.override) {
        if (constraint.x !== undefined)
          this.authoritative.add(placementKey("x", child.name));
        if (constraint.y !== undefined)
          this.authoritative.add(placementKey("y", child.name));
      }
    }

    for (const axis of POSITION_AXES) {
      const coordinate = constraint[axis];
      if (coordinate === undefined) continue;
      const idx = axisIndex(axis);
      const value = resolveCoordinate(
        coordinate,
        posScales?.[idx],
        this.sizes[idx]
      );
      if (value === undefined) continue;
      for (const child of constraint.children) {
        this.positionPinned.add(placementKey(axis, child.name));
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
  const ownership = new PlacementOwnershipPlan(
    targets,
    constraints,
    posScales,
    sizes
  );

  const spanEdgePins = constraints.flatMap((constraint, constraintIndex) =>
    constraint.type === "span"
      ? lowerSpanEdgePins(
          constraint,
          targets,
          `span[${constraintIndex}]`,
          (axis, coordinate) =>
            resolveCoordinate(coordinate, posScales?.[axisIndex(axis)])
        )
      : []
  );
  const spanExtents = collectSpanExtents(spanEdgePins);
  const spanExtentByKey = new Map(
    spanExtents.map((extent) => [
      placementKey(extent.axis, extent.name),
      extent,
    ])
  );
  for (const extent of spanExtents) {
    ownership.noteSpanExtent(extent);
  }

  const lowerer = new PlacementProgramLowerer(
    targets,
    (axis, name) => spanExtentByKey.get(placementKey(axis, name))?.size
  );
  for (const claim of spanEdgePins) lowerer.addFact(claim.fact);
  const resolveAxisCoordinate = (axis: Axis, coordinate: PositionValue) => {
    const idx = axisIndex(axis);
    return resolveCoordinate(coordinate, posScales?.[idx], sizes[idx]);
  };
  const isInitiallyPlaced = ownership.isInitiallyPlaced.bind(ownership);
  const isPinned = ownership.isPinned.bind(ownership);

  // A node that self-placed during its own layout is a hard boundary condition,
  // except where an authoritative position constraint explicitly owns the axis.
  for (const [name] of targets) {
    for (const axis of AXIS_INDICES) {
      if (!ownership.shouldPinSelfPlacement(axis, name)) continue;
      const min = targets.get(name)!.dims[axis].min;
      if (min !== undefined)
        lowerer.pin({
          axis: axisName(axis),
          target: { name, anchor: "start" },
          value: min,
          owner: "self-placement",
        });
    }
  }

  constraints.forEach((constraint, constraintIndex) => {
    const owner = `${constraint.type}[${constraintIndex}]`;

    if (constraint.type === "span") return;

    if (constraint.type === "position") {
      lowerPositionPlacement(constraint, owner, {
        emitter: lowerer,
        targets,
        isInitiallyPlaced,
        resolveCoordinate: resolveAxisCoordinate,
      });
      return;
    }

    if (constraint.type === "align") {
      lowerAlignPlacement(constraint, owner, {
        emitter: lowerer,
        targets,
        posScales,
        isPinned,
      });
      return;
    }

    if (constraint.type === "distribute") {
      lowerDistributePlacement(constraint, owner, {
        emitter: lowerer,
        targets,
        isInitiallyPlaced,
      });
      return;
    }

    if (constraint.type === "nest") {
      lowerNestPlacement(constraint, owner, lowerer);
      return;
    }

    lowerGridPlacement(constraint, owner, sizes, lowerer);
  });

  return { program: lowerer.program, spanExtents };
}
