import type { GoFishAST } from "../_ast";
import { GoFishNode, type Placeable } from "../_node";
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
import { isPositionInterval, spanDatumInterval } from "./position";
import type { AlignConstraint, AlignOptions } from "./align";
import type { DistributeConstraint, DistributeOptions } from "./distribute";
import type { PositionConstraint, PositionOptions } from "./position";
import type { ZAboveConstraint, ZBelowConstraint } from "./zorder";
import type { NestConstraint, NestOptions } from "./nest";
import type { GridConstraint, TrackLayout } from "./grid";
import { resolveScopedName, visibleNodes } from "../_ref";
import {
  childNameKey,
  isPlacedOn,
  type ConstraintPosScales,
  type ConstraintRef,
} from "./shared";
import {
  solvePlacementConstraints,
  type RigidAttachment,
} from "./placementSolver";
import { shadowCheckConstraint, SOLVER_CHECK } from "../solver/shadow";
import { RelateOperand, type RelateEnv } from "./relate";

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
    // A drawing clause of an earlier `.relate()` call is replaced by this one.
    if (n instanceof GoFishNode && n._relateClause && n.parent === layer)
      continue;
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
 * (`resolveScopedName`: missing or ambiguous names throw). Every operand must
 * lie inside the layer (a layer can only place what it contains). z-order
 * constraints are excluded: they relate SETS of nodes at paint time
 * (`paintOrder.ts`), not single placeables.
 */
export function resolveConstraintOperands(
  layer: GoFishNode
): Map<string, ResolvedOperand> {
  const out = new Map<string, ResolvedOperand>();
  for (const c of layer.constraints) {
    if (isZOrderConstraint(c)) continue;
    for (const ref of c.children) {
      if (out.has(ref.name)) continue;
      const node = resolveScopedName(
        layer,
        ref.name,
        `Constraint.${c.type} operand`
      );
      // Walk up to the layer's direct child that contains `node`.
      let cur: GoFishAST | undefined = node;
      while (cur && cur.parent !== layer) cur = cur.parent;
      const child = cur ? layer.children.indexOf(cur) : -1;
      if (child < 0) {
        throw new Error(
          `Constraint.${c.type}: operand "${ref.name}" is not inside the ` +
            `layer this .relate() is attached to. A layer can only place ` +
            `nodes it contains; attach the constraint to a layer that ` +
            `contains every operand.`
        );
      }
      out.set(ref.name, { node, child, direct: cur === node });
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
 * @param rigid - Nested operands (operand name → container name + gap), tied
 *   rigidly to the layer child that contains them
 * @param dataPositioned - Per-axis sets of child names anchored to a data scale
 *   (baseline fixed at `posScale(0)`); `align` leaves these where their own scale
 *   puts them. The space/scope fact that replaced the `placementOn` guard read.
 */
export function applyConstraints(
  constraints: ConstraintSpec[],
  nameToPlaceable: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales,
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>],
  rigid?: Map<string, RigidAttachment>
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

  // Solver shadow (observe→assert): snapshot each child's
  // per-axis placement BEFORE the solve — only when the check is on, so
  // production pays nothing — so each constraint's shadow can tell a child it
  // packed from one that arrived pre-positioned. The rank-2 solve places every
  // target at once (no per-constraint apply boundary), so the checks run once
  // AFTER the solve against the settled positions.
  const prePlaced = SOLVER_CHECK
    ? new Map<string, [boolean, boolean]>(
        [...nameToPlaceable].map(([name, p]) => [
          name,
          [isPlacedOn(p, 0), isPlacedOn(p, 1)] as [boolean, boolean],
        ])
      )
    : undefined;

  solvePlacementConstraints(
    placement,
    nameToPlaceable,
    sizes,
    posScales,
    gridTracks,
    dataPositioned,
    rigid
  );

  if (prePlaced) {
    for (const constraint of placement) {
      // Build the target list and its aligned pre-solve placement snapshot in
      // one pass (index i of each array is the same child), so the per-target
      // `prePlaced` the checks read is the state BEFORE the solve, not after.
      const targets: Placeable[] = [];
      const targetPrePlaced: [boolean, boolean][] = [];
      for (const ref of constraint.children) {
        const p = ref ? nameToPlaceable.get(ref.name) : undefined;
        if (p === undefined) continue;
        targets.push(p);
        targetPrePlaced.push(prePlaced.get(ref!.name) ?? [false, false]);
      }
      shadowCheckConstraint(
        constraint,
        targets,
        posScales,
        targetPrePlaced,
        nameToPlaceable
      );
    }
  }
}
