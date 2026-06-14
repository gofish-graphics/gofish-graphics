// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { getValue, isValue, MaybeValue } from "../data";
import { computeAesthetic } from "../../util";
import { Axis, ConstraintPosScales, ConstraintRef, axisIndex } from "./shared";
import * as Interval from "../../util/interval";

/**
 * A **size-setting** constraint (#39/#546): pin BOTH edges of each target on an
 * axis (`x: [min, max]`) and let the edges *determine the size*. This is the
 * first consumer of the linsys bbox ({@link BBox}): two anchors on one axis are
 * rank 2, so the extent (`size = max − min`) falls out — the relation scatter's
 * `xMin`/`xMax` interval channels need, which `place()`'s position-only,
 * write-once protocol could not express (it can pin a point, not set a size).
 *
 * Each endpoint is a literal pixel coordinate or a datum (`value(n)`) mapped
 * through the layer's posScale, exactly like `position`. The resolved
 * `(min, size)` is stamped into GoFish's `(local box, translate)` split: the
 * target's local box becomes `[0, size]` and its translate becomes the absolute
 * `min` on that axis.
 */
export interface SpanConstraint {
  type: "span";
  x?: [MaybeValue<number>, MaybeValue<number>];
  y?: [MaybeValue<number>, MaybeValue<number>];
  children: ConstraintRef[];
}

export interface SpanOptions {
  x?: [MaybeValue<number>, MaybeValue<number>];
  y?: [MaybeValue<number>, MaybeValue<number>];
}

export const createSpanConstraint = (
  { x, y }: SpanOptions,
  children: ConstraintRef[]
): SpanConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.span: at least one of `x` or `y` must be specified"
    );
  }
  return { type: "span", x, y, children };
};

export const isSpanConstraint = (
  c: { type: string } | undefined
): c is SpanConstraint => c !== undefined && c.type === "span";

/** Each endpoint contributes its datum value to the axis's POSITION domain
 *  (parallel to `collectPositionDomains` for `position` constraints), so the
 *  layer builds a posScale that covers the spanned range. Literal-pixel
 *  endpoints are not data and don't contribute. */
export function spanDatumInterval(
  span: [MaybeValue<number>, MaybeValue<number>] | undefined
): Interval.Interval | undefined {
  if (span === undefined) return undefined;
  const vals = span.filter(isValue).map((v) => getValue(v)!);
  if (vals.length === 0) return undefined;
  return Interval.interval(Math.min(...vals), Math.max(...vals));
}

/**
 * Resolve each axis's `[min, max]` to pixels (datum → posScale, literal as-is)
 * and hand both edges to each target's `setExtent` — the bbox-backed primitive
 * that solves the extent (two edges ⇒ rank 2 ⇒ size) and stamps it into the
 * node's `(local box, translate)` split. A datum endpoint on an axis with no
 * scale is a no-op (mirrors `applyPosition`).
 */
export function applySpan(
  constraint: SpanConstraint,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined
): void {
  const spanAxis = (
    axis: Axis,
    span: [MaybeValue<number>, MaybeValue<number>] | undefined
  ) => {
    if (span === undefined) return;
    const scale = posScales?.[axisIndex(axis)];
    const toPx = (coord: MaybeValue<number>): number | undefined => {
      if (isValue(coord) && scale === undefined) return undefined; // datum, no scale
      return computeAesthetic(coord, scale!, undefined)!;
    };
    const min = toPx(span[0]);
    const max = toPx(span[1]);
    if (min === undefined || max === undefined) return;
    for (const target of targets) target.setExtent!(axis, { min, max }, "span");
  };
  spanAxis("x", constraint.x);
  spanAxis("y", constraint.y);
}
