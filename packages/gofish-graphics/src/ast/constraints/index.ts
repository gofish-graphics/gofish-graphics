import type { GoFishAST } from "../_ast";
import { GoFishNode, type Placeable } from "../_node";
import { getValue, isValue, type MaybeValue } from "../data";
import {
  joinUnits,
  mergeCells,
  valueUnits,
  type UnitRecord,
} from "../underlyingSpace";
import { Cell } from "../cells";
import type { PositionDomains } from "./compose";
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
import {
  isPositionInterval,
  spanDatumInterval,
  type PositionCoordinate,
} from "./position";
import type { AlignConstraint, AlignOptions } from "./align";
import type { DistributeConstraint, DistributeOptions } from "./distribute";
import type { PositionConstraint, PositionOptions } from "./position";
import type { ZAboveConstraint, ZBelowConstraint } from "./zorder";
import type { NestConstraint, NestOptions } from "./nest";
import type { GridConstraint } from "./grid";
import {
  applyOverlapPlacement,
  isOverlapConstraint,
  type OverlapConstraint,
} from "./overlap";
import {
  applyLabelPlacement,
  isLabelPlaceConstraint,
  type LabelPlaceConstraint,
} from "../labels/placeStep";
import { scopedNames, visibleNodes } from "../_ref";
import {
  childNameKey,
  type ConstraintPosScales,
  type ConstraintRef,
} from "./shared";
import { RelateOperand, directChildIndex, type RelateEnv } from "./relate";

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
  PositionCoordinate,
  PositionInterval,
  PositionOptions,
} from "./position";
export { isPositionInterval, PositionRegion } from "./position";
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
// Like grid, `overlap` is a private elaboration target (scatter's `overlap`
// option), not part of the public authoring surface: no `Constraint.overlap`.
export type { OverlapConstraint } from "./overlap";
export { isOverlapConstraint } from "./overlap";
// Like overlap, `labelPlace` is a private elaboration target (`.label()` with
// a `Place` strategy), with no `Constraint.labelPlace`.
export type { LabelPlaceConstraint } from "../labels/placeStep";
export { isLabelPlaceConstraint } from "../labels/placeStep";
export { isZOrderConstraint } from "./zorder";
export { isNestConstraint, nestedSpace } from "./nest";
export {
  isGridConstraint,
  gridSpaces,
  resolveGridTracks,
  gridCellSizeByName,
  gridTracksFromSizes,
  type TrackLayout,
} from "./grid";
export { getPositioningConstraintRefs } from "./proposalPlan";
export { BBox } from "./bbox";
export {
  RelateOperand,
  scheduleRelate,
  relateScheduleForLayout,
  type RelateEnv,
  type RelateClause,
  type RelateFn,
} from "./relate";

export type ConstraintSpec =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | ZAboveConstraint
  | ZBelowConstraint
  | NestConstraint
  | GridConstraint
  | OverlapConstraint
  | LabelPlaceConstraint;

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
 * The environment a `.relate(fn)` callback receives: an ordinary object with
 * one operand (a {@link RelateOperand}) for every distinct string name inside
 * `layer` (a token-named node answers to its tag), walking the same bounded
 * tree the name lookup walks (`visibleNodes`: into nested layers, not into a
 * nested `createMark` component). These are exactly the names a constraint of
 * this layer can use: the lookup from the layer (`resolveScopedName`) stops at
 * the layer's own level for any of them, so each resolves to a node inside it,
 * while a name found only outside the layer could never be an operand. A
 * missing name reads as `undefined`, so JS destructuring defaults
 * (`({ a, pad = 8 })`) and optional checks (`note ? ... : ...`) work, and
 * `validateOperands` turns an `undefined` operand into a loud error. An
 * operand is resolved to its node at layout, by name: elaboration can swap a
 * named child for a wrapper, and the wrapper takes the name.
 */
export function relateEnv(layer: GoFishNode): RelateEnv {
  const env: RelateEnv = {};
  for (const n of visibleNodes(layer)) {
    if (n === layer) continue;
    const name = childNameKey(n);
    if (name !== undefined && !(name in env))
      env[name] = new RelateOperand(name);
  }
  return env;
}

/**
 * Throw on an operand that is not an operand, typically an `undefined` read
 * from the callback environment because no node inside the layer has that
 * name (#819). Runs when `.relate()` runs, so the stack points at the
 * callback.
 */
export function validateOperands(
  specs: ConstraintSpec[],
  env: RelateEnv
): void {
  for (const c of specs) {
    c.children.forEach((ref: ConstraintRef | undefined, i: number) => {
      if (ref && typeof ref.name === "string") return;
      const names = Object.keys(env);
      throw new Error(
        `Constraint.${c.type}: operand ${i + 1} is ${String(ref)}. A ` +
          `.relate() callback receives only the names of nodes inside its ` +
          `layer; check the spelling, or name the node with .name(...). ` +
          `Names inside this layer: ${
            names.length > 0 ? names.join(", ") : "(none)"
          }.`
      );
    });
  }
}

/** A layer constraint operand resolved to a node inside the layer: `child` is
 *  the index of the layer's direct child that is (`direct`) or contains
 *  `node`. */
export type ResolvedOperand = {
  node: GoFishAST;
  child: number;
  direct: boolean;
};

/**
 * Resolve every placement operand of `layer`'s constraints to a node inside
 * the layer, once per distinct name, with the same lookup `ref("name")` uses
 * (`resolveScopedName`: missing or ambiguous names throw), kept across the
 * names so the layer is walked once, not once per name (`scopedNames`). Every operand must
 * lie inside the layer (a layer can only place what it contains). z-order
 * constraints are excluded: they relate SETS of nodes at paint time
 * (`paintOrder.ts`), not single placeables.
 */
export function resolveConstraintOperands(
  layer: GoFishNode
): Map<string, ResolvedOperand> {
  const out = new Map<string, ResolvedOperand>();
  const resolve = scopedNames(layer);
  const childOf = directChildIndex(layer);
  for (const c of layer.constraints) {
    if (isZOrderConstraint(c)) continue;
    for (const ref of c.children) {
      if (out.has(ref.name)) continue;
      const node = resolve(ref.name, `Constraint.${c.type} operand`);
      const child = childOf(node);
      if (child < 0) {
        throw new Error(
          `Constraint.${c.type}: operand "${ref.name}" is not inside the ` +
            `layer this .relate() is attached to. A layer can only place ` +
            `nodes it contains; attach the constraint to a layer that ` +
            `contains every operand.`
        );
      }
      out.set(ref.name, {
        node,
        child,
        direct: layer.children[child] === node,
      });
    }
  }
  return out;
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
 * Measure (Stage-1 guard): a datum coordinate's units are folded per axis
 * with {@link joinUnits} (equal units unify; two *different* units throw — a
 * unit conflict among a layer's own position constraints; calendars and
 * titles join too).
 * An interval's two endpoints unify their measures the same way (an interval in
 * mixed units is a conflict). The layer's type hook then joins it with the
 * units of its own set (`resolveLayerAxisSpace` in compose.ts, a shared
 * `joinUnits`: an untagged side takes the other's unit) — restoring the unit
 * tag the scatter reduction dropped. A child its sharing sets detach or a
 * datum places is not in that union, so its unit takes no part.
 *
 * `counts` says which constraints count on each axis: a layer's type counts
 * only those that place children of its own set (`layer.tsx`), so a chrome
 * ring's ticks, each a set of its own, add nothing to the type it reports.
 */
export function collectPositionDomains(
  constraints: ConstraintSpec[],
  counts: (c: ConstraintSpec, axis: 0 | 1) => boolean = () => true
): PositionDomains {
  const axes = [newAxisDomain(), newAxisDomain()] as const;
  for (const c of constraints) {
    if (c.type !== "position") continue;
    for (const axis of [0, 1] as const) {
      if (!counts(c, axis)) continue;
      const acc = axes[axis];
      const point = axis === 0 ? c.x : c.y;
      if (point !== undefined) {
        foldCoordinate(acc, point, axis);
        acc.cells = undefined;
      }
      const span = c.region?.spans[axis];
      if (span !== undefined) {
        foldCoordinate(acc, span, axis);
        const cell = c.region!.cell;
        if (cell instanceof Cell) acc.cells?.push([cell]);
        else acc.cells = undefined;
      }
    }
  }
  const [x, y] = axes;
  return {
    x: x.domain,
    y: y.domain,
    xMeasure: x.measure,
    yMeasure: y.measure,
    xCells: x.cells && mergeCells(x.cells),
    yCells: y.cells && mergeCells(y.cells),
  };
}

/** What {@link collectPositionDomains} folds on one axis. */
type AxisDomain = {
  domain: Interval.Interval | undefined;
  /** The units of the datums, with their calendar when they are times
   *  ({@link UnitRecord}); literals carry none. */
  measure: UnitRecord | undefined;
  /** The cells the coordinates place on this axis, while every one so far
   *  is a region's cell of a line placed along this axis alone; undefined
   *  once a point, an interval, or a cell of the plane (a hexagon: no cell
   *  of this axis alone) is seen. */
  cells: (readonly Cell[])[] | undefined;
};

const newAxisDomain = (): AxisDomain => ({
  domain: undefined,
  measure: undefined,
  cells: [],
});

/** Fold one coordinate into `acc`: an interval reads as its two edges, a
 *  point as itself. Literal (pixel) coordinates carry no domain or units. An
 *  interval's two endpoints join their units the same way as two
 *  coordinates do (mixed units are a conflict). */
function foldCoordinate(
  acc: AxisDomain,
  coord: PositionCoordinate,
  axis: 0 | 1
): void {
  let iv: Interval.Interval | undefined;
  let measure: UnitRecord | undefined;
  if (isPositionInterval(coord)) {
    iv = spanDatumInterval(coord);
    measure = joinUnits(valueUnits(coord[0]), valueUnits(coord[1]), true, {
      axis,
      where: "at the two ends of a position range",
    });
  } else {
    if (isValue(coord)) {
      const n = getValue(coord as MaybeValue<number>);
      iv = Interval.interval(n, n);
    }
    measure = valueUnits(coord);
  }
  if (iv !== undefined)
    acc.domain = acc.domain ? Interval.unionAll(acc.domain, iv) : iv;
  acc.measure = joinUnits(acc.measure, measure, true, {
    axis,
    where: "across position constraints",
  });
}

/**
 * Apply a layer's constraints. The placement constraints are placed by the
 * layer's plan, which the claim walk solved once (`seat`, which writes the
 * plan's seats back: `layer`'s layout). What no plan can place runs after:
 * an overlap strategy and a label placement read where the plan put
 * everything else. z-order constraints are resolved separately at render
 * time.
 *
 * @param constraints - The constraint specs
 * @param nameToPlaceable - Map from child name to its Placeable
 * @param sizes - The layer's box size `[w, h]`, used by label placement
 * @param posScales - Per-axis data→pixel scales
 * @param seat - Writes the plan's seats back
 */
export function applyConstraints(
  constraints: ConstraintSpec[],
  nameToPlaceable: Map<string, Placeable>,
  sizes: [number, number],
  posScales: ConstraintPosScales | undefined,
  seat: () => void
): void {
  seat();

  // An overlap constraint is not a difference constraint: it reads where the
  // plan put each child on the data axis, then places the child on the free
  // axis. So it runs after the solve.
  for (const constraint of constraints)
    if (isOverlapConstraint(constraint))
      applyOverlapPlacement(constraint, nameToPlaceable, posScales);

  // A label placement reads where everything else in the layer landed (the
  // labeled marks, the labels the solve placed), so it runs last.
  for (const constraint of constraints)
    if (isLabelPlaceConstraint(constraint))
      applyLabelPlacement(constraint, nameToPlaceable, sizes);
}
