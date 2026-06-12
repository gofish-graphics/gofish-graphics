// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { SIZE, UnderlyingSpace, isSIZE } from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import type { ConstraintRef } from "./shared";

/**
 * Containment relation between two named children of a layer.
 *
 * `contain({x?, y?}, [outer, inner])`: `outer`'s size is driven by `inner`'s
 * intrinsic dims plus `2 * padding` symmetrically on each constrained axis;
 * `inner` is centered inside `outer` along each constrained axis.
 *
 * Unlike align/distribute, this constraint *drives sizing* — it is the first
 * size-setting constraint (see apps/docs/docs/internals/design/size-claims.md).
 * It contributes a triple: a *space fold* (`containedSpace`, folded into the
 * layer's space resolution so a contained pair participates in auto-fit), a
 * *layout proposal* (the layer lays inner out first, then proposes
 * `inner + 2·padding` to outer — see `layer.tsx`'s contain pre-pass), and the
 * *placement walk* below (`applyContain`).
 *
 * A missing axis (`{x: 4}` only) leaves the other axis unconstrained: `inner`
 * keeps its natural position there and `outer` keeps the layer's allotted size.
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
 * The contain constraint's *space-resolution* contribution on one axis — the
 * fold that lets a contained pair participate in the layer's auto-fit solve.
 *
 * When inner's space is SIZE (a data-driven extent, e.g. `rect({ w: value(v) })`),
 * outer's extent is that same Monotonic shifted up by `2·padding` — a
 * `Monotonic.adds`, which stays invertible, so a parent spread/layer solving a
 * scale factor sees `outer = inner + 2·padding`. Chained contains compose: the
 * layer feeds an already-derived outer back in as the next contain's inner.
 *
 * When inner is *not* SIZE (fixed-pixel / position-pinned content), there is no
 * rule to fold; `outer` keeps its own space and the layout-time pixel proposal
 * (`inner.dims + 2·padding`) handles the sizing.
 */
export function containedSpace(
  outerSpace: UnderlyingSpace,
  innerSpace: UnderlyingSpace,
  padding: number
): UnderlyingSpace {
  if (isSIZE(innerSpace)) {
    return SIZE(
      Monotonic.adds(innerSpace.domain, 2 * padding),
      innerSpace.measure
    );
  }
  return outerSpace;
}

/**
 * Position the inner child centered inside outer on each constrained axis.
 * `layer.tsx` has already sized outer to `inner.dims + 2·padding` on the same
 * axes, so centering inner yields `inner.min = outer.min + padding` naturally.
 *
 * Both targets are expected to already have positions on the constrained axes:
 * outer was placed at baseline by phase-1 (it is deliberately NOT skipped — see
 * `getPositioningConstraintRefs`), and inner is placed here.
 */
export function applyContain(
  constraint: ContainConstraint,
  outer: Placeable,
  inner: Placeable
): void {
  if (constraint.x !== undefined) {
    const outerCenter = outer.dims[0].center;
    if (outerCenter !== undefined) inner.place("x", outerCenter, "center");
  }
  if (constraint.y !== undefined) {
    const outerCenter = outer.dims[1].center;
    if (outerCenter !== undefined) inner.place("y", outerCenter, "center");
  }
}
