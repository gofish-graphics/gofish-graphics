import type { ConstraintRef } from "./shared";

/**
 * z-order (paint order) relations between named children of a layer.
 *
 * `zAbove(a, b)`: a paints in front of b (on top in z; visible over b).
 * `zBelow(a, b)`: a paints behind b (under in z; covered by b).
 *
 * These do not position; they only constrain paint order. They are resolved
 * by `orderChildrenForPaint` (paintOrder.ts), which orders the layer's direct
 * children that contain `a` and `b`, or pushes the constraint down into the
 * one child that contains both. Any node that paints its children, a bake
 * boundary such as `coord` or `enclose` included, orders them through the same
 * function; a compositor's two operands have no paint order, so a constraint
 * between them throws. See
 * apps/docs/docs/internals/layout/coord-flattening.md and
 * apps/docs/docs/internals/design/constraint-semantics.md.
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
