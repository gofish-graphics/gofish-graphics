// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import {
  getValue,
  getValueOffset,
  isDiscretePosition,
  isValue,
  type PositionValue,
} from "../data";
import type { AlignConstraint } from "./align";
import { lowerAlignPlacement } from "./align";
import type { DistributeConstraint } from "./distribute";
import { lowerDistributePlacement } from "./distribute";
import type { GridConstraint, TrackLayout } from "./grid";
import { lowerGridPlacement } from "./grid";
import type { NestConstraint } from "./nest";
import { lowerNestPlacement } from "./nest";
import { PlacementProgramLowerer } from "./placementProgramLowerer";
import type { PositionConstraint } from "./position";
import { isPositionInterval, lowerPositionPlacement } from "./position";
import { axisIndex, type Axis, type ConstraintPosScales } from "./shared";
import { pxOf, type AxisMap } from "../domain";
import type { AnchorProgram } from "./placementFacts";

export type PlacementConstraint =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | NestConstraint
  | GridConstraint;

export interface LoweredPlacement {
  /** The anchor program (#39 stage 5): facts that name a node anchor without a
   *  pre-evaluated `min` offset, consumed by the rank-2 solve. */
  anchorProgram: AnchorProgram;
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
  scale: AxisMap | undefined,
  axisSize?: number
): PlacementCoordinate {
  if (isDiscretePosition(coordinate)) {
    if (!Number.isFinite(axisSize) || coordinate.count <= 0) return undefined;
    return (coordinate.index / coordinate.count) * axisSize!;
  }
  if (!isValue(coordinate)) return coordinate;
  if (scale === undefined) return undefined;
  return pxOf(scale, getValue(coordinate)!) + getValueOffset(coordinate);
}

function resolveCoordinate(
  coordinate: PositionValue,
  scale: AxisMap | undefined,
  axisSize?: number
): number | undefined {
  return compilePlacementCoordinate(coordinate, scale, axisSize);
}

class PlacementOwnershipPlan {
  private readonly authoritative = new Set<string>();
  private readonly initiallyPlaced = new Set<string>();
  private readonly positionPinned = new Set<string>();
  private readonly dataPositionedSet: [Set<string>, Set<string>];
  private readonly sizes: [number, number];

  constructor(
    targets: Map<string, Placeable>,
    constraints: PlacementConstraint[],
    posScales: ConstraintPosScales | undefined,
    sizes: [number, number],
    dataPositioned?: [Set<string>, Set<string>]
  ) {
    this.sizes = sizes;
    this.dataPositionedSet = dataPositioned ?? [new Set(), new Set()];
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

  isInitiallyPlaced(axis: Axis, name: string): boolean {
    return this.initiallyPlaced.has(placementKey(axis, name));
  }

  isPinned(axis: Axis, name: string): boolean {
    const key = placementKey(axis, name);
    return this.initiallyPlaced.has(key) || this.positionPinned.has(key);
  }

  /** Whether this (node, axis) is anchored to a data (POSITION) scope — its
   *  baseline is fixed at `posScale(0)` by the shared map, so `align` must leave
   *  it where its own scale puts it (a scatter facet panel). Collected at the
   *  layer boundary (a SPACE/scope fact) and handed in; the ownership plan is the
   *  single authority the align guard consults, in place of the retired
   *  space-pass `placementOn` reconstruction (Stage 6f). */
  isDataPositioned(axis: 0 | 1, name: string): boolean {
    return this.dataPositionedSet[axis].has(name);
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
      // An interval pins BOTH edges — mark its children pinned when the edges
      // resolve (an align sources such a spanned target). A point pins one
      // anchor.
      if (isPositionInterval(coordinate)) {
        const min = resolveCoordinate(coordinate[0], posScales?.[idx]);
        const max = resolveCoordinate(coordinate[1], posScales?.[idx]);
        if (min === undefined || max === undefined) continue;
      } else {
        const value = resolveCoordinate(
          coordinate,
          posScales?.[idx],
          this.sizes[idx]
        );
        if (value === undefined) continue;
      }
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
  posScales?: ConstraintPosScales,
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>]
): LoweredPlacement {
  // A `position` pin on a grid cell overrides that cell's track centering on the
  // pinned axis (the authoritative-pin pattern) — collect which (cell, axis) a
  // position constraint owns so the grid skips its center pin there.
  const pinnedByPosition = new Map<string, Set<0 | 1>>();
  for (const constraint of constraints) {
    if (constraint.type !== "position") continue;
    for (const ref of constraint.children) {
      if (!ref) continue;
      const axes = pinnedByPosition.get(ref.name) ?? new Set<0 | 1>();
      if (constraint.x !== undefined) axes.add(0);
      if (constraint.y !== undefined) axes.add(1);
      if (axes.size > 0) pinnedByPosition.set(ref.name, axes);
    }
  }
  const ownership = new PlacementOwnershipPlan(
    targets,
    constraints,
    posScales,
    sizes,
    dataPositioned
  );

  const lowerer = new PlacementProgramLowerer(targets);
  const resolveAxisCoordinate = (axis: Axis, coordinate: PositionValue) => {
    const idx = axisIndex(axis);
    return resolveCoordinate(coordinate, posScales?.[idx], sizes[idx]);
  };
  const isInitiallyPlaced = ownership.isInitiallyPlaced.bind(ownership);
  const isPinned = ownership.isPinned.bind(ownership);
  const isDataPositioned = ownership.isDataPositioned.bind(ownership);

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

    if (constraint.type === "position") {
      // Point axes emit a single pin; interval axes emit both edges (strong
      // start/end pins) that cell closure resolves into a size.
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
        isDataPositioned,
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

    lowerGridPlacement(
      constraint,
      owner,
      sizes,
      lowerer,
      gridTracks,
      pinnedByPosition
    );
  });

  return { anchorProgram: lowerer.anchorProgram };
}
