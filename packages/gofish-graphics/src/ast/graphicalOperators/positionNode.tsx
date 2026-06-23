import { computeAesthetic } from "../../util";
import { GoFishNode } from "../_node";
import { Size, translateString } from "../dims";
import { getMeasure, getValue, isValue, MaybeValue } from "../data";
import {
  CONTINUOUS,
  isCONTINUOUS,
  UNDEFINED,
  UnderlyingSpace,
} from "../underlyingSpace";
import { GoFishAST } from "../_ast";

export type PositionNodeOptions = {
  key?: string;
  x?: MaybeValue<number>;
  y?: MaybeValue<number>;
};

const offsetSpace = (
  space: UnderlyingSpace,
  offset: MaybeValue<number> | undefined
): UnderlyingSpace => {
  if (offset === undefined || !isCONTINUOUS(space)) return space;
  const value = isValue(offset) ? getValue(offset) : offset;
  if (value === undefined) return space;

  const origin =
    space.placement.tag === "determined" ? space.placement.at + value : value;
  return CONTINUOUS(
    space.width,
    origin,
    space.measure ?? getMeasure(offset),
    space.coordinateTransform
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
      layout: (shared, size, scaleFactors, children, posScales, _node) => {
        if (children.length !== 1) {
          throw new Error("Position operator expects exactly one child");
        }

        const child = children[0];
        const childPlaceable = child.layout(size, scaleFactors, posScales);

        if (childPlaceable.dims[0].min === undefined) {
          childPlaceable.place("x", 0, "baseline");
        }
        if (childPlaceable.dims[1].min === undefined) {
          childPlaceable.place("y", 0, "baseline");
        }

        const offsetX =
          options.x === undefined
            ? undefined
            : (computeAesthetic(options.x, posScales[0]!, 0) ?? 0);
        const offsetY =
          options.y === undefined
            ? undefined
            : (computeAesthetic(options.y, posScales[1]!, 0) ?? 0);

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
