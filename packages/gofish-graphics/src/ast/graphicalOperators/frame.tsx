import { FancyDims } from "../dims";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { coord } from "../coordinateTransforms/coord";
import { layer } from "./layer";
import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import type { AxesOptions } from "../gofish";
export const Frame = createNodeOperator(
  (
    options: {
      key?: string;
      coord?: CoordinateTransform;
      x?: number;
      y?: number;
      transform?: { scale?: { x?: number; y?: number } };
      box?: boolean;
      axes?: AxesOptions;
      padding?: number;
    } & FancyDims,
    children: GoFishAST[]
  ) => {
    if (options.coord !== undefined) {
      // The coord is the frame's box: it takes the frame's dims (`w`, `h`,
      // `dims`, ...) as the layer branch does (#535). `transform` (a pixel
      // scale) and `box` are layer options the coord has no counterpart for.
      const {
        coord: transform,
        transform: _scale,
        box: _box,
        ...rest
      } = options;
      return coord({ ...rest, transform }, children);
    } else {
      return layer(options, children);
    }
  }
);
