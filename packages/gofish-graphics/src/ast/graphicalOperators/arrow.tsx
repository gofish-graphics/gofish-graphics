import { GoFishAST } from "../_ast";
import { GoFishNode, type ToPixel } from "../_node";
import { Size, displayTranslate } from "../dims";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, withToPixel } from "../displayList/lowerHelpers";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { axisScale } from "../domain";
import { createNodeOperator } from "../withGoFish";
import { orderChildrenForPaint } from "../paintOrder";
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

type ArrowProps = typeof defaultArrowOpts & ArrowOpts;

/** An operand's box, `(x, y)` its min corner, in the arrow's frame. */
export type ArrowBox = { x: number; y: number; w: number; h: number };

/** The arrow's geometry between two boxes: its start, control and end
 *  points and its end angle. A pure function of the operands' boxes, so a
 *  transition that moves the operands can draw the arrow again at every frame
 *  (`src/animation/relationTween.tsx`). */
export function arrowGeometry(from: ArrowBox, to: ArrowBox, props: ArrowProps) {
  const t = getBoxToBoxArrow(
    from.x,
    from.y,
    from.w,
    from.h,
    to.x,
    to.y,
    to.w,
    to.h,
    props
  );
  return {
    sx: t[0],
    sy: t[1],
    cx: t[2],
    cy: t[3],
    ex: t[4],
    ey: t[5],
    ae: t[6],
    as: t[7],
    ec: t[8],
  };
}

/** The arrow's own items (start dot, body, head), with its points mapped to
 *  pixels by `own`. */
export function arrowItems(
  data: ReturnType<typeof arrowGeometry>,
  props: ArrowProps,
  own: ToPixel
): DisplayList.DisplayItem[] {
  const sw = props.strokeWidth ?? 0;
  const endAngle = data.ae; // radians
  const px = (x: number, y: number) => own([x, y]).join(",");
  const stroke = props.stroke;
  const items: DisplayList.DisplayItem[] = [];

  if (props.start) {
    const [cx, cy] = own([data.sx, data.sy]);
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
  return items;
}

/** Each arrow node's resolved options, for a transition that draws it again
 *  from moving operands. */
const arrowProps = new WeakMap<GoFishNode, ArrowProps>();
export const arrowPropsOf = (node: GoFishNode): ArrowProps | undefined =>
  arrowProps.get(node);

export const arrow = createNodeOperator(
  (opts: ArrowOpts, children: GoFishAST[]) => {
    const props: ArrowProps = { ...defaultArrowOpts, ...opts };

    const self = new GoFishNode(
      {
        type: "arrow",
        shared: [false, false],
        resolveUnderlyingSpace: (
          _childSpaces: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (shared, size, scales, layoutChildren, node) => {
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
          const boxOf = (dims: typeof fromDims): ArrowBox => ({
            x: dims[0].min!,
            y: dims[1].min!,
            w: dims[0].size!,
            h: dims[1].size!,
          });

          const combinedBBox = union(
            bbox(
              fromDims[0].min!,
              fromDims[0].max!,
              fromDims[1].min!,
              fromDims[1].max!
            ),
            bbox(toDims[0].min!, toDims[0].max!, toDims[1].min!, toDims[1].max!)
          );

          // The arrow is computed and kept in the arrow's axis order; `lower`
          // places it through its `local` map.
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
            renderData: arrowGeometry(boxOf(fromDims), boxOf(toDims), props),
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
          const [tx, ty] = displayTranslate(transform);
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          // Children are placed in pixels under the arrow's translate; the
          // arrow's own points are in its axis order, placed by `local`.
          const composed: ToPixel = ([cx, cy]) => outer([tx + cx, ty + cy]);
          const own: ToPixel = (p) => outer(local(p));
          const items = arrowItems(renderData!, props, own);

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
      },
      children
    );
    arrowProps.set(self, props);
    return self;
  }
);

export default arrow;
