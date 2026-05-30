import type { GoFishAST } from "../_ast";
import { GoFishNode, type Placeable } from "../_node";
import { isToken, type Token } from "../createName";
import { applyAlign, createAlignConstraint } from "./align";
import { applyDistribute, createDistributeConstraint } from "./distribute";
import {
  createZAboveConstraint,
  createZBelowConstraint,
  isZOrderConstraint,
} from "./zorder";
import type { AlignConstraint, AlignOptions } from "./align";
import type { DistributeConstraint, DistributeOptions } from "./distribute";
import type { ZAboveConstraint, ZBelowConstraint } from "./zorder";
import type { ConstraintRef } from "./shared";

export type { Axis, Alignment, ConstraintRef } from "./shared";
export type { AlignConstraint, AlignOptions } from "./align";
export type { DistributeConstraint, DistributeOptions } from "./distribute";
export type {
  ZAboveConstraint,
  ZBelowConstraint,
  ZOrderConstraint,
} from "./zorder";
export { isZOrderConstraint } from "./zorder";

export type ConstraintSpec =
  | AlignConstraint
  | DistributeConstraint
  | ZAboveConstraint
  | ZBelowConstraint;

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
  zAbove(a: ConstraintRef, b: ConstraintRef): ZAboveConstraint {
    return createZAboveConstraint(a, b);
  },
  zBelow(a: ConstraintRef, b: ConstraintRef): ZBelowConstraint {
    return createZBelowConstraint(a, b);
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
 * `distribute`). Used by `layer.tsx` to compute `constrainedNames`, which
 * controls phase-1 baseline-placement skipping. z-order constraints don't
 * position, so they must be excluded.
 */
export function getPositioningConstraintRefs(
  constraints: ConstraintSpec[]
): Set<string> {
  const names = new Set<string>();
  for (const c of constraints) {
    if (isZOrderConstraint(c)) continue;
    for (const ref of c.children) if (ref) names.add(ref.name);
  }
  return names;
}

/**
 * Apply *positioning* constraints to a set of placeables. z-order constraints
 * are skipped here — they are resolved at render time, not layout time.
 *
 * @param constraints - The constraint specs to apply in order
 * @param nameToPlaceable - Map from child name to its Placeable
 */
export function applyConstraints(
  constraints: ConstraintSpec[],
  nameToPlaceable: Map<string, Placeable>,
  fallbackBaselines?: {
    x?: { start?: number; middle?: number; end?: number };
    y?: { start?: number; middle?: number; end?: number };
  }
): void {
  for (const constraint of constraints) {
    if (isZOrderConstraint(constraint)) continue;

    const targets = constraint.children
      .map((ref) => nameToPlaceable.get(ref.name))
      .filter((p): p is Placeable => p !== undefined);

    if (targets.length === 0) continue;

    if (constraint.type === "align") {
      applyAlign(constraint, targets, fallbackBaselines);
    } else {
      applyDistribute(constraint, targets);
    }
  }
}
