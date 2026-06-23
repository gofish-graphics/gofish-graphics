// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  CONTINUOUS,
  UnderlyingSpace,
  isBaselineMagnitude,
} from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import type { ConstraintRef } from "./shared";
import type { PlacementFactEmitter } from "./placementFacts";

/**
 * Nesting relation between two named children of a layer.
 *
 * `nest({x?, y?}, [outer, inner])`: the relation `outer = inner + 2·padding`
 * holds symmetrically on each constrained axis, and `inner` is centered inside
 * `outer` there. Padding is always known, so the unknown per axis is *which*
 * side is derived — dispatched by the layer's nest pre-pass on which side
 * carries the size (see `layer.tsx` and size-claims.md "Dimension B"):
 *   - inner sized, outer not → INSIDE_OUT: `outer = inner + 2·padding` (boxes
 *     that shrink-wrap their content).
 *   - outer sized (or neither: the layer sizes outer) → OUTSIDE_IN:
 *     `inner = outer − 2·padding` (CSS padding).
 *
 * Unlike align/distribute, this constraint *drives sizing* — it is the first
 * size-setting constraint (see apps/docs/docs/internals/design/size-claims.md).
 * It contributes a triple: a *space fold* (`nestedSpace`, folded into the
 * layer's space resolution for the inside-out direction so a nested pair
 * participates in auto-fit), a *layout proposal* (the layer lays the source out
 * first, then proposes `source ± 2·padding` to the derived node — see
 * `layer.tsx`'s nest pre-pass), and a placement relation emitted by
 * `placementSolver.ts` (identical for both directions).
 *
 * A missing axis (`{x: 4}` only) leaves the other axis unconstrained: `inner`
 * keeps its natural position there and `outer` keeps the layer's allotted size.
 */
export interface NestConstraint {
  type: "nest";
  x?: number;
  y?: number;
  /** `[outer, inner]` — outer nests inner. */
  children: [ConstraintRef, ConstraintRef];
}

export interface NestOptions {
  x?: number;
  y?: number;
}

export const createNestConstraint = (
  { x, y }: NestOptions,
  children: [ConstraintRef, ConstraintRef]
): NestConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.nest: at least one of `x` or `y` must be specified"
    );
  }
  if (children.length !== 2) {
    throw new Error(
      `Constraint.nest: expected exactly 2 children [outer, inner], got ${children.length}`
    );
  }
  return { type: "nest", x, y, children };
};

export const isNestConstraint = (
  c: { type: string } | undefined
): c is NestConstraint => c !== undefined && c.type === "nest";

export function lowerNestPlacement(
  constraint: NestConstraint,
  owner: string,
  emitter: PlacementFactEmitter
): void {
  const [outer, inner] = constraint.children;
  if (constraint.x !== undefined)
    emitter.relate({
      axis: "x",
      from: { name: outer.name, anchor: "middle" },
      to: { name: inner.name, anchor: "middle" },
      gap: 0,
      owner,
    });
  if (constraint.y !== undefined)
    emitter.relate({
      axis: "y",
      from: { name: outer.name, anchor: "middle" },
      to: { name: inner.name, anchor: "middle" },
      gap: 0,
      owner,
    });
}

/**
 * The nest constraint's *space-resolution* contribution on one axis for the
 * INSIDE_OUT direction — the fold that lets a nested pair participate in the
 * layer's auto-fit solve. (The OUTSIDE_IN direction derives nothing here: the
 * outer's own claim flows through the union, and `inner = outer − 2·padding` is
 * a pure layout-time proposal.)
 *
 * When inner's space is SIZE (a data-driven extent, e.g. `rect({ w: value(v) })`),
 * outer's extent is that same Monotonic shifted up by `2·padding` — a
 * `Monotonic.adds`, which stays invertible, so a parent spread/layer solving a
 * scale factor sees `outer = inner + 2·padding`. Chained nests compose: the
 * layer feeds an already-derived outer back in as the next nest's inner.
 *
 * When inner is *not* SIZE (fixed-pixel / position-pinned content), there is no
 * rule to fold; `outer` keeps its own space and the layout-time pixel proposal
 * (`inner.dims + 2·padding`) handles the sizing.
 */
export function nestedSpace(
  outerSpace: UnderlyingSpace,
  innerSpace: UnderlyingSpace,
  padding: number
): UnderlyingSpace {
  // Only a baseline magnitude ("free") folds `outer = inner + 2·padding`, and
  // the padded outer is itself a baseline magnitude (it must stay "free" so a
  // parent spread's auto-fit solves a scale factor against it); data-positioned
  // or origin-less content keeps `outer`.
  if (isBaselineMagnitude(innerSpace)) {
    return CONTINUOUS(
      Monotonic.adds(innerSpace.width, 2 * padding),
      "free",
      innerSpace.measure
    );
  }
  return outerSpace;
}
