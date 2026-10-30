import type { Dimensions, Interval } from "../dims";

/**
 * A resolved axis-aligned box in a node's LOCAL layout frame (the frame of
 * `intrinsicDims`, before the node's own translate).
 */
export type Box = { min: [number, number]; max: [number, number] };

/** The one query every geometry has. */
export interface HasBox {
  readonly box: Box;
}

/** One axis of a local box. `min` is usually set; a box that only knows its
 *  `max` or `center` (plus its `size`) is resolved from those. */
const axisExtent = (
  id: Interval | undefined,
  axis: 0 | 1,
  nodeType: string
): [number, number] => {
  const size = id?.size;
  if (size === undefined)
    throw new Error(
      `[gofish] geometry(): ${nodeType} has no size on axis ${axis}`
    );
  const min =
    id?.min ??
    (id?.max !== undefined
      ? id.max - size
      : id?.center !== undefined
        ? id.center - size / 2
        : undefined);
  if (min === undefined)
    throw new Error(
      `[gofish] geometry(): ${nodeType} has no local position on axis ${axis}`
    );
  return [min, min + size];
};

/** A node's `intrinsicDims` as a {@link Box}. */
export function boxOfDims(dims: Dimensions, nodeType = "node"): Box {
  const [x0, x1] = axisExtent(dims[0], 0, nodeType);
  const [y0, y1] = axisExtent(dims[1], 1, nodeType);
  return { min: [x0, y0], max: [x1, y1] };
}

/** The span `[lo, hi]` drawn in by `by` at each end, about its middle, and
 *  never below zero length: `[mid, mid]` when it is thinner than `2 · by`.
 *  Unchanged when `by` is 0. */
function insetSpan(lo: number, hi: number, by: number): [number, number] {
  if (by === 0) return [lo, hi];
  const mid = (lo + hi) / 2;
  const half = Math.max(0, Math.abs(hi - lo) - 2 * by) / 2;
  return [mid - half, mid + half];
}

/**
 * A box drawn in by `by[axis]` at each end of each axis ({@link insetSpan}):
 * what a rect or a region with an `inset` draws, where `by` is the inset on
 * each axis its parent sizes it on and 0 on the others. `empty` is true when
 * an inset axis has nothing left.
 */
export function insetBox(
  box: Box,
  by: readonly [number, number]
): { box: Box; empty: boolean } {
  const [x0, x1] = insetSpan(box.min[0], box.max[0], by[0]);
  const [y0, y1] = insetSpan(box.min[1], box.max[1], by[1]);
  return {
    box: { min: [x0, y0], max: [x1, y1] },
    empty: (by[0] > 0 && x1 === x0) || (by[1] > 0 && y1 === y0),
  };
}

/**
 * A ring's axis-aligned extent, in one pass. (`Math.min(...ring.map(...))` reads
 * nicely but allocates two arrays per axis and blows the argument limit on a
 * detailed coastline.)
 */
export const ringExtent = (
  ring: readonly (readonly [number, number])[]
): { minX: number; maxX: number; minY: number; maxY: number } => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
};
