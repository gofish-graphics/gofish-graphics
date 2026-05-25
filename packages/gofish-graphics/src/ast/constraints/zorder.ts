import type { ConstraintRef } from "./shared";

/**
 * z-order (paint order) relations between named children of a layer.
 *
 * `zAbove(a, b)`: a paints in front of b (on top in z; visible over b).
 * `zBelow(a, b)`: a paints behind b (under in z; covered by b).
 *
 * These do not position; they only constrain paint order. They are resolved
 * by `layer.tsx`'s render via a topological sort over the children flattened
 * across non-component nested layers — see notes/nested-layer-tiers.md.
 *
 * `zBelow(a, b)` is equivalent to `zAbove(b, a)`; both are provided so the
 * spec reads naturally either way.
 */

export interface ZAboveConstraint {
  type: "zAbove";
  /** `[front, back]` — `front` paints later (on top). */
  children: [ConstraintRef, ConstraintRef];
}

export interface ZBelowConstraint {
  type: "zBelow";
  /** `[back, front]` — `back` paints earlier (under). */
  children: [ConstraintRef, ConstraintRef];
}

export type ZOrderConstraint = ZAboveConstraint | ZBelowConstraint;

export const createZAboveConstraint = (
  a: ConstraintRef,
  b: ConstraintRef
): ZAboveConstraint => ({ type: "zAbove", children: [a, b] });

export const createZBelowConstraint = (
  a: ConstraintRef,
  b: ConstraintRef
): ZBelowConstraint => ({ type: "zBelow", children: [a, b] });

export const isZOrderConstraint = (
  c: { type: string } | undefined
): c is ZOrderConstraint =>
  c !== undefined && (c.type === "zAbove" || c.type === "zBelow");
