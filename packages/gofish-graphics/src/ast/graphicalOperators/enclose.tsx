import * as BubbleSets from "bubblesets-js";
import { GoFishNode, type ToPixel } from "../_node";
import { Size, displayTranslate, translateString } from "../dims";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, rectItemFromBox } from "../displayList/lowerHelpers";
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
        render: ({ intrinsicDims, transform, renderData }, children) => {
          return (
            <g transform={translateString(transform)}>
              {children}
              <rect
                x={-padding}
                y={-padding}
                width={intrinsicDims?.[0]?.size ?? 0}
                height={intrinsicDims?.[1]?.size ?? 0}
                rx={rx}
                ry={ry}
                fill="none"
                stroke={gray}
                stroke-width={1}
              />
            </g>
          );
        },
        // IR lowering — mirror of render: lower the children under the node's
        // translate (the legacy `<g transform>`), then the enclosure rect on top.
        lower: (
          { intrinsicDims, transform, coordinateTransform },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const [tx, ty] = displayTranslate(transform);
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          const composed: ToPixel = ([cx, cy]) => outer([tx + cx, ty + cy]);

          session.toPixel = composed;
          let childItems: DisplayList.DisplayItem[];
          try {
            childItems = node.children.flatMap((c) =>
              c.INTERNAL_lower(coordinateTransform)
            );
          } finally {
            session.toPixel = outer;
          }

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
