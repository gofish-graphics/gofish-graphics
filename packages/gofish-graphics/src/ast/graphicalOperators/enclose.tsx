import { GoFishNode } from "../_node";
import { Size, displayTranslate } from "../dims";
import type { DisplayList } from "gofish-ir";
import {
  lowerChildrenOffset,
  lowerStyle,
  rectItemFromBox,
} from "../displayList/lowerHelpers";
import { GoFishAST } from "../_ast";
import { black, gray, tailwindColors } from "../../color";
import { Domain } from "../domain";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";

export const enclose = createNodeOperator(
  (
    {
      padding = 2,
      rx = 2,
      ry = 2,
    }: { padding?: number; rx?: number; ry?: number },
    children: GoFishAST[]
  ) => {
    return new GoFishNode(
      {
        type: "enclose",
        shared: [false, false],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          return [UNDEFINED, UNDEFINED];
        },
        layout: (shared, size, scaleFactors, children, posScales) => {
          const childPlaceables = [];

          for (const child of children) {
            const childPlaceable = child.layout(size, scaleFactors, posScales);
            childPlaceable.place("x", 0, "baseline");
            childPlaceable.place("y", 0, "baseline");
            childPlaceables.push(childPlaceable);
          }

          const maxWidth = Math.max(
            ...childPlaceables.map(
              (childPlaceable) => childPlaceable.dims[0].max!
            )
          );
          const maxHeight = Math.max(
            ...childPlaceables.map(
              (childPlaceable) => childPlaceable.dims[1].max!
            )
          );
          return {
            intrinsicDims: {
              x: -padding,
              y: -padding,
              w: maxWidth + padding * 2,
              h: maxHeight + padding * 2,
            },
            transform: { translate: [undefined, undefined] },
          };
        },
        // IR lowering — mirror of render: lower the children under the node's
        // translate (the legacy `<g transform>`), then the enclosure rect on top.
        lower: (
          { intrinsicDims, transform, coordinateTransform },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const childItems = lowerChildrenOffset(
            node,
            transform,
            coordinateTransform
          );
          const [tx, ty] = displayTranslate(transform);
          const outer = node.getRenderSession().toPixel!;

          const w = intrinsicDims?.[0]?.size ?? 0;
          const h = intrinsicDims?.[1]?.size ?? 0;
          // Enclosure rect at local (-padding, -padding, w, h), inside the
          // node's translate → absolute y-up box, mapped via the outer toPixel.
          const box = rectItemFromBox(
            tx - padding,
            tx - padding + w,
            ty - padding,
            ty - padding + h,
            outer,
            {
              rx,
              ry,
              role: "overlay",
              style: lowerStyle({ fill: "none", stroke: gray, strokeWidth: 1 }),
            }
          );
          return [...childItems, box];
        },
      },
      children
    );
  }
);
