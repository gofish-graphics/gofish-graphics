// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { getValue, isValue, MaybeValue } from "../data";
import { computeAesthetic } from "../../util";
import { BBox } from "./bbox";
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
 * Resolve each axis's `[min, max]` to pixels (datum → posScale, literal as-is),
 * solve the bbox (rank 2 → size), and stamp `(local [0, size], translate=min)`
 * into every target. A datum endpoint on an axis with no scale is a no-op
 * (mirrors `applyPosition`).
 */
export function applySpan(
  constraint: SpanConstraint,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined,
  onConflict?: (msg: string) => void
): void {
  const spanAxis = (
    axis: Axis,
    span: [MaybeValue<number>, MaybeValue<number>] | undefined
  ) => {
    if (span === undefined) return;
    const idx = axisIndex(axis);
    const scale = posScales?.[idx];
    const toPx = (coord: MaybeValue<number>): number | undefined => {
      if (isValue(coord) && scale === undefined) return undefined; // datum, no scale
      return computeAesthetic(coord, scale!, undefined)!;
    };
    const minPx = toPx(span[0]);
    const maxPx = toPx(span[1]);
    if (minPx === undefined || maxPx === undefined) return;

    const bbox = new BBox();
    bbox.add("min", minPx, "span");
    const conflict = bbox.add("max", maxPx, "span");
    if (conflict && onConflict)
      onConflict(
        `Constraint.span: ${axis} over-determined — max asserts ${conflict.asserted} but the system implies ${conflict.implied}`
      );
    const min = bbox.read("min")!;
    const size = bbox.read("size")!;

    for (const target of targets) {
      const node = target as {
        intrinsicDims?: {
          min?: number;
          size?: number;
          center?: number;
          max?: number;
          embedded?: boolean;
        }[];
        transform?: { translate?: (number | undefined)[] };
      };
      if (!node.intrinsicDims) node.intrinsicDims = [];
      node.intrinsicDims[idx] = {
        ...(node.intrinsicDims[idx] ?? {}),
        min: 0,
        size,
        center: size / 2,
        max: size,
      };
      if (!node.transform) node.transform = {};
      if (!node.transform.translate)
        node.transform.translate = [undefined, undefined];
      node.transform.translate[idx] = min;
    }
  };
  spanAxis("x", constraint.x);
  spanAxis("y", constraint.y);
}
