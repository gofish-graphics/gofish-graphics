import type { GoFishAST } from "../_ast";
import { GoFishNode, type Placeable } from "../_node";
import { isToken, type Token } from "../createName";
import {
  getMeasure,
  getValue,
  isValue,
  type MaybeValue,
  type Measure,
} from "../data";
import { mergeMeasures } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { createAlignConstraint } from "./align";
import { createDistributeConstraint } from "./distribute";
import { createPositionConstraint } from "./position";
import {
  createZAboveConstraint,
  createZBelowConstraint,
  isZOrderConstraint,
} from "./zorder";
import { createNestConstraint } from "./nest";
import { spanDatumInterval } from "./span";
import { isPositionInterval } from "./position";
import type { AlignConstraint, AlignOptions } from "./align";
import type { DistributeConstraint, DistributeOptions } from "./distribute";
import type { PositionConstraint, PositionOptions } from "./position";
import type { ZAboveConstraint, ZBelowConstraint } from "./zorder";
import type { NestConstraint, NestOptions } from "./nest";
import type { GridConstraint } from "./grid";
import { type ConstraintPosScales, type ConstraintRef } from "./shared";
import { solvePlacementConstraints } from "./placementSolver";

export type {
  Axis,
  Alignment,
  ConstraintRef,
  ConstraintPosScales,
} from "./shared";
export type { AlignConstraint, AlignOptions } from "./align";
export type { DistributeConstraint, DistributeOptions } from "./distribute";
export type {
  PositionConstraint,
  PositionInterval,
  PositionOptions,
} from "./position";
export { isPositionInterval } from "./position";
export type {
  ZAboveConstraint,
  ZBelowConstraint,
  ZOrderConstraint,
} from "./zorder";
export type { NestConstraint, NestOptions } from "./nest";
// `GridConstraint` stays in the ConstraintSpec union, but grid is not part of
// the public authoring surface: it is `table`'s private elaboration target
// (`createGridConstraint` in ./grid, used by table.tsx). No `Constraint.grid`.
export type { GridConstraint } from "./grid";
export { isZOrderConstraint } from "./zorder";
export { isNestConstraint, nestedSpace } from "./nest";
export { isGridConstraint, gridSpaces, gridCellSize } from "./grid";
export { getPositioningConstraintRefs } from "./proposalPlan";
export { BBox } from "./bbox";

export type ConstraintSpec =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | ZAboveConstraint
  | ZBelowConstraint
  | NestConstraint
  | GridConstraint;

// --- Factory ---

export const Constraint = {
  align(options: AlignOptions, children: ConstraintRef[]): AlignConstraint {
    return createAlignConstraint(options, children);
  },
  distribute(
    options: DistributeOptions,
    children: ConstraintRef[]
  ): DistributeConstraint {
    return createDistributeConstraint(options, children);
  },
  position(
    options: PositionOptions,
    children: ConstraintRef[]
  ): PositionConstraint {
    return createPositionConstraint(options, children);
  },
  zAbove(a: ConstraintRef, b: ConstraintRef): ZAboveConstraint {
    return createZAboveConstraint(a, b);
  },
  zBelow(a: ConstraintRef, b: ConstraintRef): ZBelowConstraint {
    return createZBelowConstraint(a, b);
  },
  nest(
    options: NestOptions,
    children: [ConstraintRef, ConstraintRef]
  ): NestConstraint {
    return createNestConstraint(options, children);
  },
};

// --- Resolution ---

/**
 * Build a name->ConstraintRef map from the named children of a node. Descends
 * into non-component plain `layer` children so a layer's `.constrain()` can
 * name elements in nested tiers (mirrors `_ref.tsx`'s `findInComponent`).
 *
 * Direct children win on name collision (collected before descent).
 */
export function collectConstraintRefs(
  children: GoFishAST[]
): Record<string, ConstraintRef> {
  const refs: Record<string, ConstraintRef> = {};
  collect(children);
  return refs;

  function collect(cs: GoFishAST[]): void {
    // Phase 1: collect direct children (so they win on collision). Both
    // GoFishNode and GoFishRef carry `_name`, so a named ref (used as a
    // cross-tier stand-in) is a valid constraint target too.
    for (const child of cs) {
      const raw = (child as { _name?: string | Token })._name;
      if (raw) {
        const name = isToken(raw) ? raw.__tag : raw;
        if (!(name in refs)) refs[name] = { name };
      }
    }
    // Phase 2: recurse into non-component plain layers (refs have no children).
    for (const child of cs) {
      if (!(child instanceof GoFishNode)) continue;
      if (child._isComponent) continue;
      if (child.type !== "layer") continue;
      collect(child.children);
    }
  }
}

/**
 * Fold the *datum* coordinates of any `position` constraints into a per-axis
 * data interval. This is the constraint system's *fragment* of underlying-space
 * resolution: a `Constraint.position({ y: datum(v) })` declares that its target
 * lives at data value `v`, so the union of those values is the layer's POSITION
 * domain on that axis. An interval coordinate (`{ x: [a, b] }`) contributes its
 * whole datum range `interval(min(a,b), max(a,b))`. Literal (raw-pixel)
 * coordinates and endpoints are *not* data and don't contribute. The layer's
 * `resolveUnderlyingSpace` merges this with the children's spaces (see
 * `layer.tsx`).
 *
 * Measure (Stage-1 guard): a datum coordinate's `measure` is folded per axis
 * with {@link mergeMeasures} (equal measures unify; two *different* defined
 * measures throw — a unit conflict among a layer's own position constraints).
 * An interval's two endpoints unify their measures the same way (an interval in
 * mixed units is a conflict). The layer's `resolveAxis` then treats this as the
 * axis's unit, PREFERRING it over the children's POSITION measure (falling back
 * to the children only for untagged literal-pixel coords) — restoring the unit
 * tag the scatter reduction dropped, without strict-unifying against a
 * self-scaling child's leaked unit.
 */
export function collectPositionDomains(constraints: ConstraintSpec[]): {
  x?: Interval.Interval;
  y?: Interval.Interval;
  xMeasure?: Measure;
  yMeasure?: Measure;
} {
  let x: Interval.Interval | undefined;
  let y: Interval.Interval | undefined;
  let xMeasure: Measure | undefined;
  let yMeasure: Measure | undefined;
  const pointInterval = (
    coord: PositionConstraint["x"]
  ): Interval.Interval | undefined => {
    if (!isValue(coord)) return undefined;
    const n = getValue(coord as MaybeValue<number>);
    return Interval.interval(n, n);
  };
  const unionIv = (
    acc: Interval.Interval | undefined,
    iv: Interval.Interval | undefined
  ) => (iv === undefined ? acc : acc ? Interval.unionAll(acc, iv) : iv);
  // A point datum's measure; literals carry none. An interval's `[min,max]`
  // endpoints unify their two measures the same way (mixed units are a conflict).
  const coordMeasure = (
    coord: PositionConstraint["x"] | undefined
  ): Measure | undefined => {
    if (coord === undefined) return undefined;
    return isPositionInterval(coord)
      ? mergeMeasures(
          getMeasure(coord[0]),
          getMeasure(coord[1]),
          "position interval endpoints"
        )
      : getMeasure(coord);
  };
  const coordInterval = (
    coord: PositionConstraint["x"] | undefined
  ): Interval.Interval | undefined =>
    coord === undefined
      ? undefined
      : isPositionInterval(coord)
        ? spanDatumInterval(coord)
        : pointInterval(coord);
  for (const c of constraints) {
    if (c.type !== "position") continue;
    x = unionIv(x, coordInterval(c.x));
    y = unionIv(y, coordInterval(c.y));
    xMeasure = mergeMeasures(
      xMeasure,
      coordMeasure(c.x),
      "position constraints"
    );
    yMeasure = mergeMeasures(
      yMeasure,
      coordMeasure(c.y),
      "position constraints"
    );
  }
  return { x, y, xMeasure, yMeasure };
}

/**
 * Apply a layer's constraints as one relational placement problem. An
 * interval-form `position` contributes extent facts to the same solve, so
 * declaration order cannot choose whether size or position wins. z-order
 * constraints are resolved separately at render time.
 *
 * @param constraints - The constraint specs to compose
 * @param nameToPlaceable - Map from child name to its Placeable
 * @param sizes - The layer's box size `[w, h]`, used by grid placement
 * @param posScales - Per-axis data→pixel scales for `position` constraints
 */
export function applyConstraints(
  constraints: ConstraintSpec[],
  nameToPlaceable: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales
): void {
  const placement = constraints.filter(
    (
      constraint
    ): constraint is
      | AlignConstraint
      | DistributeConstraint
      | PositionConstraint
      | NestConstraint
      | GridConstraint => !isZOrderConstraint(constraint)
  );
  solvePlacementConstraints(placement, nameToPlaceable, sizes, posScales);
}
