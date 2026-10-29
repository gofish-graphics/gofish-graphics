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
import type { GridConstraint, TrackLayout } from "./grid";
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
import { visibleNodes } from "../_ref";
import {
  childNameKey,
  isPlacedOn,
  type ConstraintPosScales,
  type FreeOrigin,
  type ConstraintRef,
  type KeyOf,
} from "./shared";
import {
  solvePlacementConstraints,
  type RigidAttachment,
} from "./placementSolver";
import { shadowCheckConstraint, SOLVER_CHECK } from "../solver/shadow";
import { RelateOperand, type RelateEnv } from "./relate";
export type { ResolvedOperand } from "../_ref";
export { SlotOperand, NodeOperand, childSlots } from "./shared";

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
  gridCellSizeByKey,
  gridTracksFromSizes,
  type TrackLayout,
} from "./grid";
export { getPositioningConstraintRefs } from "./proposalPlan";
export { BBox } from "./bbox";
export {
  RelateOperand,
  scheduleRelate,
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
 * this layer can use: the lookup from the layer (`lookupName`) stops at the
 * layer's own level for any of them, so each resolves to a node inside it,
 * while a name found only outside the layer could never be an operand. A
 * missing name reads as `undefined`, so JS destructuring defaults
 * (`({ a, pad = 8 })`) and optional checks (`note ? ... : ...`) work, and
 * `validateOperands` turns an `undefined` operand into a loud error. Each
 * `resolveReferences` round resolves an operand by its name from `layer` (its
 * scope), to the nodes the name means then.
 */
export function relateEnv(layer: GoFishNode): RelateEnv {
  const env: RelateEnv = {};
  for (const n of visibleNodes(layer)) {
    if (n === layer) continue;
    const name = childNameKey(n);
    if (name !== undefined && !(name in env))
      env[name] = new RelateOperand(name, layer);
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
        // An enclosing cell's span (`PositionRegion.placed`) places the
        // child as an interval does: the cell is the outer partition's.
        const cell = c.region!.cell;
        if (cell instanceof Cell && c.region!.placed[axis])
          acc.cells?.push([cell]);
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
 * Apply a layer's constraints as one relational placement problem. An
 * interval-form `position` contributes extent facts to the same solve, so
 * declaration order cannot choose whether size or position wins. z-order
 * constraints are resolved separately at render time.
 *
 * @param constraints - The constraint specs to compose
 * @param keyOf - Each operand's key: the uid of the node the layer's last
 *   `resolveReferences` round resolved it to
 * @param keyToPlaceable - Map from operand key (`keyOf`) to its Placeable
 * @param sizes - The layer's box size `[w, h]`, used by grid placement
 * @param posScales - Per-axis data→pixel scales for `position` constraints
 * @param rigid - Nested operands (operand key → container key + gap), tied
 *   rigidly to the layer child that contains them
 * @param dataPositioned - Per-axis sets of operand keys anchored to a data scale
 *   (baseline fixed at `posScale(0)`); `align` leaves these where their own scale
 *   puts them. The space/scope fact that replaced the `placementOn` guard read.
 */
export function applyConstraints(
  constraints: ConstraintSpec[],
  keyOf: KeyOf,
  keyToPlaceable: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales,
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>],
  rigid?: Map<string, RigidAttachment>,
  freeOrigin?: FreeOrigin,
  apart?: [Set<string>, Set<string>]
): void {
  const placement = constraints.filter(
    (
      constraint
    ): constraint is
      | AlignConstraint
      | DistributeConstraint
      | PositionConstraint
      | NestConstraint
      | GridConstraint =>
      !isZOrderConstraint(constraint) &&
      !isOverlapConstraint(constraint) &&
      !isLabelPlaceConstraint(constraint)
  );

  // Solver shadow (observe→assert): snapshot each child's
  // per-axis placement BEFORE the solve — only when the check is on, so
  // production pays nothing — so each constraint's shadow can tell a child it
  // packed from one that arrived pre-positioned. The rank-2 solve places every
  // target at once (no per-constraint apply boundary), so the checks run once
  // AFTER the solve against the settled positions.
  const prePlaced = SOLVER_CHECK
    ? new Map<string, [boolean, boolean]>(
        [...keyToPlaceable].map(([key, p]) => [
          key,
          [isPlacedOn(p, 0), isPlacedOn(p, 1)] as [boolean, boolean],
        ])
      )
    : undefined;

  solvePlacementConstraints(
    placement,
    keyOf,
    keyToPlaceable,
    sizes,
    posScales,
    gridTracks,
    dataPositioned,
    rigid,
    freeOrigin,
    apart
  );

  // An overlap constraint is not a difference constraint: it reads where the
  // solve put each child on the data axis, then places the child on the free
  // axis. So it runs after the solve.
  for (const constraint of constraints)
    if (isOverlapConstraint(constraint))
      applyOverlapPlacement(constraint, keyToPlaceable, keyOf, posScales);

  // A label placement reads where everything else in the layer landed (the
  // labeled marks, the labels the solve placed), so it runs last.
  for (const constraint of constraints)
    if (isLabelPlaceConstraint(constraint))
      applyLabelPlacement(constraint, keyToPlaceable, keyOf, sizes);

  if (prePlaced) {
    for (const constraint of placement) {
      // Build the target list and its aligned pre-solve placement snapshot in
      // one pass (index i of each array is the same child), so the per-target
      // `prePlaced` the checks read is the state BEFORE the solve, not after.
      const targets: Placeable[] = [];
      const targetPrePlaced: [boolean, boolean][] = [];
      for (const ref of constraint.children) {
        const key = ref ? keyOf(ref) : undefined;
        const p = key === undefined ? undefined : keyToPlaceable.get(key);
        if (p === undefined) continue;
        targets.push(p);
        targetPrePlaced.push(prePlaced.get(key!) ?? [false, false]);
      }
      shadowCheckConstraint(
        constraint,
        targets,
        posScales,
        targetPrePlaced,
        keyToPlaceable,
        keyOf
      );
    }
  }
}
