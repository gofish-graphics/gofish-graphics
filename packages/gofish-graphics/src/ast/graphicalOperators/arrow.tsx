import { GoFishAST } from "../_ast";
import { GoFishNode, type ToPixel } from "../_node";
import { Size, displayTranslate } from "../dims";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, withToPixel } from "../displayList/lowerHelpers";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { type ArrowOptions, getBoxToBoxArrow } from "perfect-arrows";
import { bbox, union } from "../../util/bbox";

export type ArrowOpts = {
  stroke?: string;
  strokeWidth?: number;
  start?: boolean;
} & ArrowOptions;

const defaultArrowOpts: Required<
  Pick<
    ArrowOpts,
    | "bow"
    | "stretch"
    | "stretchMin"
    | "stretchMax"
    | "padStart"
    | "padEnd"
    | "flip"
    | "straights"
    | "stroke"
    | "strokeWidth"
    | "start"
  >
> = {
  bow: 0.2,
  stretch: 0.5,
  stretchMin: 40,
  stretchMax: 420,
  padStart: 5,
  padEnd: 20,
  flip: false,
  straights: true,
  stroke: "black",
  strokeWidth: 3,
  start: false,
};

export const arrow = createNodeOperator(
  (opts: ArrowOpts, children: GoFishAST[]) => {
    const props = { ...defaultArrowOpts, ...opts };

    return new GoFishNode(
      {
        type: "arrow",
        shared: [false, false],
        resolveUnderlyingSpace: (
          _childSpaces: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (shared, size, scaleFactors, layoutChildren) => {
          if (layoutChildren.length < 2) {
            return {
              intrinsicDims: [
                { min: 0, size: 0 },
                { min: 0, size: 0 },
              ],
              transform: { translate: [0, 0] },
              renderData: undefined,
            };
          }

          const childPlaceables = layoutChildren.map((child) =>
            child.layout(size, scaleFactors, [undefined, undefined])
          );
          const fromDims = childPlaceables[0].dims;
          const toDims = childPlaceables[1].dims;

          const arrowTuple = getBoxToBoxArrow(
            fromDims[0].min!,
            fromDims[1].min!,
            fromDims[0].size!,
            fromDims[1].size!,
            toDims[0].min!,
            toDims[1].min!,
            toDims[0].size!,
            toDims[1].size!,
            props
          );

          const combinedBBox = union(
            bbox(
              fromDims[0].min!,
              fromDims[0].max!,
              fromDims[1].min!,
              fromDims[1].max!
            ),
            bbox(toDims[0].min!, toDims[0].max!, toDims[1].min!, toDims[1].max!)
          );

          return {
            intrinsicDims: [
              {
                min: combinedBBox.minX,
                size: combinedBBox.maxX - combinedBBox.minX,
              },
              {
                min: combinedBBox.minY,
                size: combinedBBox.maxY - combinedBBox.minY,
              },
            ],
            transform: { translate: [0, 0] },
            renderData: {
              sx: arrowTuple[0],
              sy: arrowTuple[1],
              cx: arrowTuple[2],
              cy: arrowTuple[3],
              ex: arrowTuple[4],
              ey: arrowTuple[5],
              ae: arrowTuple[6],
              as: arrowTuple[7],
              ec: arrowTuple[8],
            },
          };
        },
        // IR lowering — mirror of render. The arrow's parts live under the
        // node's translate (no local flip), so each point is offset by that
        // translate and pushed through `toPixel`. The arrowhead's
        // `translate(ex,ey) rotate(θ)` is baked into the emitted points.
        lower: (
          { transform, renderData, coordinateTransform },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const data = renderData!;
          const sw = props.strokeWidth ?? 0;
          const endAngle = data.ae; // radians
          const [tx, ty] = displayTranslate(transform);
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          const composed: ToPixel = ([cx, cy]) => outer([tx + cx, ty + cy]);
          const px = (x: number, y: number) => composed([x, y]).join(",");

          const stroke = props.stroke;
          const items: DisplayList.DisplayItem[] = [];

          if (props.start) {
            const [cx, cy] = composed([data.sx, data.sy]);
            items.push({
              kind: "ellipse",
              cx,
              cy,
              rx: (4 / 3) * sw,
              ry: (4 / 3) * sw,
              role: "overlay",
              style: lowerStyle({ fill: stroke }),
            });
          }

          // Quadratic body M sx,sy Q cx,cy ex,ey.
          items.push({
            kind: "path",
            d: `M${px(data.sx, data.sy)} Q${px(data.cx, data.cy)} ${px(data.ex, data.ey)}`,
            role: "overlay",
            style: lowerStyle({ fill: "none", stroke, strokeWidth: sw }),
          });

          // Arrowhead: rotate each head point by the end angle, translate to
          // (ex, ey), then map. SVG `rotate(θ)` = [[cosθ,-sinθ],[sinθ,cosθ]].
          const cos = Math.cos(endAngle);
          const sin = Math.sin(endAngle);
          const head = [
            [0, -2],
            [4, 0],
            [0, 2],
          ]
            .map(([x, y]) => [x * sw, y * sw])
            .map(([x, y]) => [
              data.ex + (x * cos - y * sin),
              data.ey + (x * sin + y * cos),
            ])
            .map(([x, y]) => px(x, y));
          items.push({
            kind: "path",
            d: `M${head[0]} L${head[1]} L${head[2]} Z`,
            role: "overlay",
            style: lowerStyle({ fill: stroke }),
          });

          // Children lower under the same translate.
          items.push(
            ...withToPixel(node, composed, () =>
              node.children.flatMap((c) =>
                c.INTERNAL_lower(coordinateTransform)
              )
            )
          );
          return items;
        },
      },
      children
    );
  }
);

export default arrow;
