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
import { createGridConstraint, isGridConstraint } from "./grid";
import {
  createSpanConstraint,
  isSpanConstraint,
  spanDatumInterval,
} from "./span";
import type { AlignConstraint, AlignOptions } from "./align";
import type { DistributeConstraint, DistributeOptions } from "./distribute";
import type { PositionConstraint, PositionOptions } from "./position";
import type { ZAboveConstraint, ZBelowConstraint } from "./zorder";
import type { NestConstraint, NestOptions } from "./nest";
import type { GridConstraint, GridOptions } from "./grid";
import type { SpanConstraint, SpanOptions } from "./span";
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
export type { PositionConstraint, PositionOptions } from "./position";
export type {
  ZAboveConstraint,
  ZBelowConstraint,
  ZOrderConstraint,
} from "./zorder";
export type { NestConstraint, NestOptions } from "./nest";
export type { GridConstraint, GridOptions } from "./grid";
export type { SpanConstraint, SpanOptions } from "./span";
export { isZOrderConstraint } from "./zorder";
export { isNestConstraint, nestedSpace } from "./nest";
export { isGridConstraint, gridSpaces, gridCellSize } from "./grid";
export { isSpanConstraint } from "./span";
export { getPositioningConstraintRefs } from "./proposalPlan";
export { BBox } from "./bbox";

export type ConstraintSpec =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | ZAboveConstraint
  | ZBelowConstraint
  | NestConstraint
  | GridConstraint
  | SpanConstraint;

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
  grid(options: GridOptions, children: ConstraintRef[]): GridConstraint {
    return createGridConstraint(options, children);
  },
  span(options: SpanOptions, children: ConstraintRef[]): SpanConstraint {
    return createSpanConstraint(options, children);
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
 * domain on that axis. Literal (raw-pixel) coordinates are *not* data and don't
 * contribute. The layer's `resolveUnderlyingSpace` merges this with the
 * children's spaces (see `layer.tsx`).
 *
 * Measure (Stage-1 guard): a datum coordinate's `measure` is folded per axis
 * with {@link mergeMeasures} (equal measures unify; two *different* defined
 * measures throw — a unit conflict among a layer's own position constraints).
 * The layer's `resolveAxis` then treats this as the axis's unit, PREFERRING it
 * over the children's POSITION measure (falling back to the children only for
 * untagged literal-pixel coords) — restoring the unit tag the scatter reduction
 * dropped, without strict-unifying against a self-scaling child's leaked unit.
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
  const fold = (
    acc: Interval.Interval | undefined,
    coord: PositionConstraint["x"]
  ): Interval.Interval | undefined => {
    if (!isValue(coord)) return acc;
    const n = getValue(coord as MaybeValue<number>);
    const iv = Interval.interval(n, n);
    return acc ? Interval.unionAll(acc, iv) : iv;
  };
  const unionIv = (
    acc: Interval.Interval | undefined,
    iv: Interval.Interval | undefined
  ) => (iv === undefined ? acc : acc ? Interval.unionAll(acc, iv) : iv);
  // A datum endpoint's measure; literals carry none. `[min,max]` span endpoints
  // unify their two measures the same way (a span in mixed units is a conflict).
  const coordMeasure = (
    coord: PositionConstraint["x"] | undefined
  ): Measure | undefined =>
    coord === undefined ? undefined : getMeasure(coord);
  const spanMeasure = (
    span: SpanConstraint["x"] | undefined
  ): Measure | undefined =>
    span === undefined
      ? undefined
      : mergeMeasures(
          getMeasure(span[0]),
          getMeasure(span[1]),
          "span endpoints"
        );
  for (const c of constraints) {
    if (c.type === "position") {
      x = fold(x, c.x);
      y = fold(y, c.y);
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
    } else if (isSpanConstraint(c)) {
      // A span's two endpoints contribute their data range to the axis domain,
      // so the layer builds a posScale covering the spanned interval.
      x = unionIv(x, spanDatumInterval(c.x));
      y = unionIv(y, spanDatumInterval(c.y));
      xMeasure = mergeMeasures(xMeasure, spanMeasure(c.x), "span constraints");
      yMeasure = mergeMeasures(yMeasure, spanMeasure(c.y), "span constraints");
    }
  }
  return { x, y, xMeasure, yMeasure };
}

/**
 * Apply a layer's constraints as one relational placement problem. `span`
 * contributes extent facts to the same solve, so declaration order cannot choose
 * whether size or position wins. z-order constraints are resolved separately at
 * render time.
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
      | SpanConstraint
      | NestConstraint
      | GridConstraint => !isZOrderConstraint(constraint)
  );
  solvePlacementConstraints(placement, nameToPlaceable, sizes, posScales);
}
