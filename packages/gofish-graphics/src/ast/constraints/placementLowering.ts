// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

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
import type { GapOf } from "./gap";
import type { GridConstraint, GridTracks } from "./grid";
import { lowerGridPlacement } from "./grid";
import type { NestConstraint } from "./nest";
import { lowerNestPlacement } from "./nest";
import {
  PlacementProgramLowerer,
  type SolvePlaceable,
} from "./placementProgramLowerer";
import type { PositionConstraint } from "./position";
import { isPositionInterval, lowerPositionPlacement } from "./position";
import {
  axisIndex,
  axisName,
  placementKey,
  type Axis,
  type ConstraintPosScales,
} from "./shared";
import type { AxisMap } from "../domain";
import type { AnchorProgram } from "./placementFacts";
import type { Arith } from "../solver/arith";

export type PlacementConstraint =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | NestConstraint
  | GridConstraint;

export interface LoweredPlacement<T = number> {
  /** The anchor program (#39 stage 5): facts that name a node anchor without a
   *  pre-evaluated `min` offset, consumed by the rank-2 solve. */
  anchorProgram: AnchorProgram<T>;
}

/** A raw placement-system coordinate after datum values have been elaborated
 *  through the layer's data→pixel scale. Undefined means a datum coordinate had
 *  no scale in this scope, so the fact cannot be emitted. */
export type PlacementCoordinate<T = number> = T | undefined;

const AXIS_INDICES = [0, 1] as const;
const POSITION_AXES = ["x", "y"] as const;

export function compilePlacementCoordinate<T>(
  A: Arith<T>,
  coordinate: PositionValue,
  scale: AxisMap<T> | undefined,
  axisSize?: T
): PlacementCoordinate<T> {
  if (isDiscretePosition(coordinate)) {
    if (axisSize === undefined || coordinate.count <= 0) return undefined;
    return A.scale(coordinate.index / coordinate.count, axisSize);
  }
  if (!isValue(coordinate)) return A.constant(coordinate);
  // A map takes only a number to a pixel: a datum that is not one (a value
  // of a field whose values are not numbers) has no place on the axis.
  const value = getValue(coordinate);
  if (scale === undefined || typeof value !== "number" || Number.isNaN(value))
    return undefined;
  // `pxOf`, in `A`.
  return A.add(
    A.scale(value, scale.sigma),
    scale.originPx,
    A.constant(getValueOffset(coordinate))
  );
}

class PlacementOwnershipPlan<T> {
  private readonly authoritative = new Set<string>();
  private readonly initiallyPlaced = new Set<string>();
  private readonly positionPinned = new Set<string>();
  private readonly dataPositionedSet: [Set<string>, Set<string>];
  private readonly sizes: readonly [T, T];

  constructor(
    private readonly A: Arith<T>,
    targets: Map<string, SolvePlaceable<T>>,
    constraints: PlacementConstraint[],
    posScales: ConstraintPosScales<T> | undefined,
    sizes: readonly [T, T],
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
   *  single authority the align guard consults. */
  isDataPositioned(axis: 0 | 1, name: string): boolean {
    return this.dataPositionedSet[axis].has(name);
  }

  shouldPinSelfPlacement(axis: 0 | 1, name: string): boolean {
    const key = placementKey(axisName(axis), name);
    return this.initiallyPlaced.has(key) && !this.authoritative.has(key);
  }

  private notePositionConstraint(
    constraint: PositionConstraint,
    posScales: ConstraintPosScales<T> | undefined
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
      // An interval pins BOTH edges — mark its children pinned when the
      // edges resolve (an align sources such a target). A point pins one
      // anchor. (A region pins nothing: its target placed itself in the
      // region it was handed at layout, so it is initially placed.)
      if (isPositionInterval(coordinate)) {
        const min = compilePlacementCoordinate(
          this.A,
          coordinate[0],
          posScales?.[idx]
        );
        const max = compilePlacementCoordinate(
          this.A,
          coordinate[1],
          posScales?.[idx]
        );
        if (min === undefined || max === undefined) continue;
      } else {
        const value = compilePlacementCoordinate(
          this.A,
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

export function lowerPlacementConstraints<T>(
  A: Arith<T>,
  constraints: PlacementConstraint[],
  targets: Map<string, SolvePlaceable<T>>,
  sizes: readonly [T, T],
  // The gap a chain or table lays out between its parts (`GoFishNode.gapOf`).
  gapOf: GapOf,
  posScales?: ConstraintPosScales<T>,
  // Per axis, the grid's resolved tracks, where the grid places its cells.
  gridTracks: GridTracks<T> = [undefined, undefined],
  dataPositioned?: [Set<string>, Set<string>]
): LoweredPlacement<T> {
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
    A,
    targets,
    constraints,
    posScales,
    sizes,
    dataPositioned
  );

  const lowerer = new PlacementProgramLowerer(targets);
  const resolveAxisCoordinate = (axis: Axis, coordinate: PositionValue) => {
    const idx = axisIndex(axis);
    return compilePlacementCoordinate(
      A,
      coordinate,
      posScales?.[idx],
      sizes[idx]
    );
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

    switch (constraint.type) {
      case "position":
        // Point axes emit a single pin; interval axes emit both edges (strong
        // start/end pins) that cell closure resolves into a size.
        lowerPositionPlacement(constraint, owner, {
          emitter: lowerer,
          targets,
          isInitiallyPlaced,
          resolveCoordinate: resolveAxisCoordinate,
        });
        return;
      case "align":
        lowerAlignPlacement(constraint, owner, {
          A,
          emitter: lowerer,
          targets,
          posScales,
          isPinned,
          isDataPositioned,
        });
        return;
      case "distribute":
        lowerDistributePlacement(constraint, owner, {
          A,
          emitter: lowerer,
          targets,
          isInitiallyPlaced,
          gapOf,
        });
        return;
      case "nest":
        lowerNestPlacement(A, constraint, owner, lowerer);
        return;
      case "grid":
        lowerGridPlacement(
          A,
          constraint,
          owner,
          lowerer,
          gridTracks,
          pinnedByPosition
        );
        return;
    }
  });

  return { anchorProgram: lowerer.anchorProgram };
}
