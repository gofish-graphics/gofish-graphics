import type { Placeable } from "../_node";
import type { ConstraintRef } from "./shared";

/**
 * Containment relation between two named children of a layer.
 *
 * `contain({x?, y?}, [outer, inner])`: `outer`'s size is driven by `inner`'s
 * intrinsic dims plus `2 * padding` symmetrically on each constrained axis.
 * `inner` is centered inside `outer` along each constrained axis.
 *
 * Unlike align/distribute, this constraint *drives sizing* — the layer must
 * see it before phase-1 layout so it can order children inner-first and
 * override outer's size with the inner-derived value. See `layer.tsx`'s
 * `flattenForContain` / `topoSortForContain` pre-pass.
 *
 * Missing axis (`{x: 4}` only) leaves the other axis unconstrained: `inner`
 * keeps its natural y-position (whatever the layer's default placement gives
 * it) and `outer` keeps the layer's available y-size.
 */
export interface ContainConstraint {
  type: "contain";
  x?: number;
  y?: number;
  /** `[outer, inner]` — outer contains inner. */
  children: [ConstraintRef, ConstraintRef];
}

export interface ContainOptions {
  x?: number;
  y?: number;
}

export const createContainConstraint = (
  { x, y }: ContainOptions,
  children: [ConstraintRef, ConstraintRef]
): ContainConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.contain: at least one of `x` or `y` must be specified"
    );
  }
  if (children.length !== 2) {
    throw new Error(
      `Constraint.contain: expected exactly 2 children [outer, inner], got ${children.length}`
    );
  }
  return { type: "contain", x, y, children };
};

export const isContainConstraint = (
  c: { type: string } | undefined
): c is ContainConstraint => c !== undefined && c.type === "contain";

/**
 * Position the inner child centered inside outer on each constrained axis.
 * Layer.tsx has already sized outer to `inner.intrinsicDims + 2*padding` on
 * the same axes — centering the inner naturally yields
 * `inner.min = outer.min + padding`.
 *
 * Both targets are expected to already have positions on the constrained
 * axes (outer was placed at baseline by phase-1; inner is placed here).
 */
export function applyContain(
  constraint: ContainConstraint,
  outer: Placeable,
  inner: Placeable
): void {
  if (constraint.x !== undefined) {
    const outerCenter = outer.dims[0].center;
    if (outerCenter !== undefined) {
      inner.place("x", outerCenter, "center");
    }
  }
  if (constraint.y !== undefined) {
    const outerCenter = outer.dims[1].center;
    if (outerCenter !== undefined) {
      inner.place("y", outerCenter, "center");
    }
  }
}
