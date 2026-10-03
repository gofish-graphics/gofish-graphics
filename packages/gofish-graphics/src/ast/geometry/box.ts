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
