import { computeAesthetic } from "../../util";
import { posFn } from "../domain";
import { GoFishNode } from "../_node";
import { Size } from "../dims";
import { getMeasure, getValue, isValue, MaybeValue } from "../data";
import {
  anchorAt,
  isCONTINUOUS,
  UNDEFINED,
  UnderlyingSpace,
} from "../underlyingSpace";
import { GoFishAST } from "../_ast";
import { Extent } from "../extent";
import * as Monotonic from "../../util/monotonic";

export type PositionNodeOptions = {
  key?: string;
  x?: MaybeValue<number>;
  y?: MaybeValue<number>;
};

const offsetSpace = (
  space: UnderlyingSpace,
  offset: MaybeValue<number> | undefined
): UnderlyingSpace => {
  // A raw number is a pixel offset (layout below translates by it as is), so
  // it moves no data: only a datum offset shifts the data space.
  if (!isValue(offset) || !isCONTINUOUS(space)) return space;
  const value = getValue(offset);
  if (value === undefined) return space;

  // Shift the data interval by `value` and pin it: a pinned space moves by
  // `value`, a free or difference space hangs its origin at `value`. The claim
  // moves with it (see `offsetExtent` below).
  return anchorAt(space, value, space.measure ?? getMeasure(offset));
};

/** The claim of {@link offsetSpace}'s result: a claim is measured from data
 *  0, so moving the content up by a datum `value` moves `value·σ` from below
 *  0 to above it. The content keeps its own σ-affine width (pixel overhead
 *  included), so it sizes as before. */
const offsetExtent = (
  space: UnderlyingSpace,
  extent: Extent | undefined,
  offset: MaybeValue<number> | undefined
): Extent | undefined => {
  if (extent === undefined || !isValue(offset) || !isCONTINUOUS(space))
    return extent;
  const value = getValue(offset);
  if (value === undefined) return extent;
  return Extent(
    Monotonic.add(extent.ascent, Monotonic.linear(value, 0)),
    Monotonic.add(extent.descent, Monotonic.linear(-value, 0))
  );
};

export const positionNode = (
  options: PositionNodeOptions,
  children: GoFishAST[]
) =>
  new GoFishNode(
    {
      type: "position",
      key: options.key,
      shared: [false, false],
      resolveUnderlyingSpace: (children: Size<UnderlyingSpace>[]) => {
        const child = children[0] ?? [UNDEFINED, UNDEFINED];
        return [
          offsetSpace(child[0], options.x),
          offsetSpace(child[1], options.y),
        ];
      },
      resolveExtent: (childExtents, childSpaces) => {
        const extent = childExtents[0] ?? [undefined, undefined];
        const child = childSpaces[0] ?? [UNDEFINED, UNDEFINED];
        return [
          offsetExtent(child[0], extent[0], options.x),
          offsetExtent(child[1], extent[1], options.y),
        ];
      },
      layout: (shared, size, scales, children) => {
        if (children.length !== 1) {
          throw new Error("Position operator expects exactly one child");
        }

        const child = children[0];
        const childPlaceable = child.layout(size, scales);

        if (childPlaceable.dims[0].min === undefined) {
          childPlaceable.place("x", 0, "baseline");
        }
        if (childPlaceable.dims[1].min === undefined) {
          childPlaceable.place("y", 0, "baseline");
        }

        const offsetX =
          options.x === undefined
            ? undefined
            : (computeAesthetic(options.x, posFn(scales[0]?.map)!, 0) ?? 0);
        const offsetY =
          options.y === undefined
            ? undefined
            : (computeAesthetic(options.y, posFn(scales[1]?.map)!, 0) ?? 0);

        return {
          intrinsicDims: [
            {
              min:
                childPlaceable.dims[0].min === undefined
                  ? undefined
                  : childPlaceable.dims[0].min + (offsetX ?? 0),
              size: childPlaceable.dims[0].size,
            },
            {
              min:
                childPlaceable.dims[1].min === undefined
                  ? undefined
                  : childPlaceable.dims[1].min + (offsetY ?? 0),
              size: childPlaceable.dims[1].size,
            },
          ],
          transform: {
            translate: [offsetX, offsetY],
          },
        };
      },
    },
    children
  );
