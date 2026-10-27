import { GoFishAST } from "../_ast";
import { GoFishNode, defaultGeometry, type ToPixel } from "../_node";
import { flattenPath, orderToPixel } from "../geometry";
import { Size, displayTranslate } from "../dims";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  withToPixel,
} from "../displayList/lowerHelpers";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { axisScale } from "../domain";
import { createNodeOperator } from "../withGoFish";
import { orderChildrenForPaint } from "../paintOrder";
import type { ArrowOptions } from "perfect-arrows";
import { bbox, union } from "../../util/bbox";
import {
  type BezierCurve,
  type Path,
  type Point,
  pathBounds,
  segment,
} from "../../path";
import { perfectArrowsRouter } from "./routers";

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
        resolveUnderlyingSpace: (
          _childSpaces: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (size, scales, layoutChildren, node) => {
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

          // Forward σ (size slope) but not the anchored map: arrow anchors to
          // its endpoints' bboxes, not to data position.
          const childPlaceables = layoutChildren.map((child) =>
            child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );
          const fromDims = childPlaceables[0].dims;
          const toDims = childPlaceables[1].dims;

          // The body is connect's perfect-arrows route; the head and the
          // start dot are the arrow's own decoration on it.
          const body = perfectArrowsRouter(fromDims, toDims, {
            dir: 0,
            opts: props,
          });
          const arc = body[0] as BezierCurve;
          const [sx, sy] = arc.start;
          const [ex, ey] = arc.end;
          // The end angle: the arc's direction where it ends, from its last
          // control point to its end.
          const ae = Math.atan2(ey - arc.control2[1], ex - arc.control2[0]);
          const sw = props.strokeWidth ?? 0;
          // Arrowhead: the head triangle rotated by the end angle and moved
          // to the end. SVG `rotate(θ)` = [[cosθ,-sinθ],[sinθ,cosθ]].
          const cos = Math.cos(ae);
          const sin = Math.sin(ae);
          const head: Point[] = [
            [0, -2],
            [4, 0],
            [0, 2],
          ].map(([x, y]) => [
            ex + (x * sw * cos - y * sw * sin),
            ey + (x * sw * sin + y * sw * cos),
          ]);
          // The start dot's radius. `local` and `toPixel` only move and flip
          // (no scale), so this length is the same in layout units and in
          // the pixels `lower` draws it in.
          const dot = props.start ? (4 / 3) * sw : 0;

          // The box holds the endpoint boxes and the geometry of what the
          // arrow draws: the body bows off the line between its ends (#1166),
          // and the head and start dot reach past the body's ends. The
          // stroke's width past that geometry is not counted yet (#1173).
          const box = [
            bbox(
              fromDims[0].min!,
              fromDims[0].max!,
              fromDims[1].min!,
              fromDims[1].max!
            ),
            bbox(
              toDims[0].min!,
              toDims[0].max!,
              toDims[1].min!,
              toDims[1].max!
            ),
            pathBounds([
              ...body,
              segment(head[0], head[1]),
              segment(head[1], head[2]),
            ]),
            bbox(sx - dot, sx + dot, sy - dot, sy + dot),
          ].reduce(union);

          // The arrow is computed and kept in the arrow's axis order; `lower`
          // places it through its `local` map.
          return {
            intrinsicDims: [
              { min: box.minX, size: box.maxX - box.minX },
              { min: box.minY, size: box.maxY - box.minY },
            ],
            transform: { translate: [0, 0] },
            renderData: { body, head, dot },
          };
        },
        // IR lowering. The arrow's parts live under the node's translate, so
        // each point is offset by that translate and pushed through `toPixel`. The arrowhead's
        // `translate(ex,ey) rotate(θ)` is baked into the emitted points.
        lower: (
          { transform, renderData, coordinateTransform, local },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const data = renderData!;
          const sw = props.strokeWidth ?? 0;
          const [tx, ty] = displayTranslate(transform);
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          // Children are placed in pixels under the arrow's translate; the
          // arrow's own points are in its axis order, placed by `local`.
          const composed: ToPixel = ([cx, cy]) => outer([tx + cx, ty + cy]);
          const own: ToPixel = (p) => outer(local(p));
          const px = (x: number, y: number) => own([x, y]).join(",");

          const stroke = props.stroke;
          const items: DisplayList.DisplayItem[] = [];

          const body: Path = data.body;
          if (props.start) {
            const [cx, cy] = own((body[0] as BezierCurve).start);
            items.push({
              kind: "ellipse",
              cx,
              cy,
              rx: data.dot,
              ry: data.dot,
              role: "overlay",
              style: lowerStyle({ fill: stroke }),
            });
          }

          items.push({
            kind: "path",
            d: pathToPixelSVG(body, own),
            role: "overlay",
            style: lowerStyle({ fill: "none", stroke, strokeWidth: sw }),
          });

          const head = data.head.map(([x, y]: Point) => px(x, y));
          items.push({
            kind: "path",
            d: `M${head[0]} L${head[1]} L${head[2]} Z`,
            role: "overlay",
            style: lowerStyle({ fill: stroke }),
          });

          // Children lower under the same translate, in the shared paint
          // order (#982). Which child is the source and which the target is
          // read from `node.children` by index; paint order does not change it.
          items.push(
            ...withToPixel(node, composed, () =>
              orderChildrenForPaint(node).flatMap((c) =>
                c.INTERNAL_lower(coordinateTransform)
              )
            )
          );
          return items;
        },
        // Its outline is its body, an open path from its start to the tip
        // of its head; the head's triangle is decoration on it.
        geometry: (laidOut, layoutChildren, node) => ({
          ...defaultGeometry(laidOut, layoutChildren, node),
          outline: (tolerance) =>
            laidOut.renderData === undefined
              ? []
              : [
                  {
                    points: orderToPixel(
                      flattenPath(laidOut.renderData.body as Path, tolerance),
                      node.yFrame.direction
                    ),
                    closed: false,
                  },
                ],
        }),
      },
      children
    );
  }
);

export default arrow;
