import type { GoFishAST } from "../_ast";
import { GoFishNode, type Placeable } from "../_node";
import { isToken, type Token } from "../createName";
import { getValue, isValue } from "../data";
import * as Interval from "../../util/interval";
import { applyAlign, createAlignConstraint } from "./align";
import { applyDistribute, createDistributeConstraint } from "./distribute";
import { applyPosition, createPositionConstraint } from "./position";
import {
  createZAboveConstraint,
  createZBelowConstraint,
  isZOrderConstraint,
} from "./zorder";
import { applyNest, createNestConstraint, isNestConstraint } from "./nest";
import { applyGrid, createGridConstraint, isGridConstraint } from "./grid";
import type { AlignConstraint, AlignOptions } from "./align";
import type { DistributeConstraint, DistributeOptions } from "./distribute";
import type { PositionConstraint, PositionOptions } from "./position";
import type { ZAboveConstraint, ZBelowConstraint } from "./zorder";
import type { NestConstraint, NestOptions } from "./nest";
import type { GridConstraint, GridOptions } from "./grid";
import { type ConstraintPosScales, type ConstraintRef } from "./shared";

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
export { isZOrderConstraint } from "./zorder";
export { isNestConstraint, nestedSpace } from "./nest";
export { isGridConstraint, gridSpaces, gridCellSize } from "./grid";

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
  grid(options: GridOptions, children: ConstraintRef[]): GridConstraint {
    return createGridConstraint(options, children);
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
 * The set of names referenced by *positioning* constraints (`align` /
 * `distribute` / `nest`). Used by `layer.tsx` to compute `constrainedNames`,
 * which controls phase-1 baseline-placement skipping. z-order constraints don't
 * position, so they must be excluded.
 *
 * `nest` is special: only the inner child (`children[1]`) skips baseline
 * placement. The outer child (`children[0]`) is left in the set so phase-1
 * places it at baseline — `applyNest` reads outer's placed position to
 * center inner inside it.
 */
export function getPositioningConstraintRefs(
  constraints: ConstraintSpec[]
): Set<string> {
  const names = new Set<string>();
  for (const c of constraints) {
    if (isZOrderConstraint(c)) continue;
    if (isNestConstraint(c)) {
      names.add(c.children[1].name);
      continue;
    }
    // grid: every cell is placed by `applyGrid`, so all skip phase-1 baseline.
    for (const ref of c.children) if (ref) names.add(ref.name);
  }
  return names;
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
 * Measure note (Stage-1 guard): these constraint-datum domains are left
 * UNTAGGED (no Measure). The layer merges them permissively into the
 * children's POSITION, whose measure wins. A `datum(v, measure)` coordinate's
 * unit is therefore not yet enforced against the children's — a deliberate
 * permissive edge until constraint domains carry measures end-to-end.
 */
export function collectPositionDomains(constraints: ConstraintSpec[]): {
  x?: Interval.Interval;
  y?: Interval.Interval;
} {
  let x: Interval.Interval | undefined;
  let y: Interval.Interval | undefined;
  const fold = (
    acc: Interval.Interval | undefined,
    coord: PositionConstraint["x"]
  ): Interval.Interval | undefined => {
    if (!isValue(coord)) return acc;
    const n = getValue(coord);
    const iv = Interval.interval(n, n);
    return acc ? Interval.unionAll(acc, iv) : iv;
  };
  for (const c of constraints) {
    if (c.type !== "position") continue;
    x = fold(x, c.x);
    y = fold(y, c.y);
  }
  return { x, y };
}

/**
 * Apply *positioning* constraints to a set of placeables. z-order constraints
 * are skipped here — they are resolved at render time, not layout time.
 *
 * @param constraints - The constraint specs to apply in order
 * @param nameToPlaceable - Map from child name to its Placeable
 * @param sizes - The layer's box size `[w, h]`, used to derive an unanchored
 *   `align`'s fallback baseline (layer-box edge) per axis
 * @param posScales - Per-axis data→pixel scales for `position` constraints
 */
export function applyConstraints(
  constraints: ConstraintSpec[],
  nameToPlaceable: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: ConstraintPosScales
): void {
  for (const constraint of constraints) {
    if (isZOrderConstraint(constraint)) continue;

    if (isNestConstraint(constraint)) {
      const outer = nameToPlaceable.get(constraint.children[0].name);
      const inner = nameToPlaceable.get(constraint.children[1].name);
      if (outer && inner) applyNest(constraint, outer, inner);
      continue;
    }

    if (isGridConstraint(constraint)) {
      applyGrid(constraint, nameToPlaceable, sizes);
      continue;
    }

    const targets = constraint.children
      .map((ref) => nameToPlaceable.get(ref.name))
      .filter((p): p is Placeable => p !== undefined);

    if (targets.length === 0) continue;

    if (constraint.type === "align") {
      applyAlign(constraint, targets, sizes, posScales);
    } else if (constraint.type === "position") {
      applyPosition(constraint, targets, posScales);
    } else {
      applyDistribute(constraint, targets);
    }
  }
}
