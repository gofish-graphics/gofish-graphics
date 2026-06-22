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
      return coord(
        {
          key: options.key,
          x: options.x,
          y: options.y,
          transform: options.coord,
          axes: options.axes,
          padding: options.padding,
        },
        children
      );
    } else {
      return layer(options, children);
    }
  }
);
