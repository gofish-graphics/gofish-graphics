import { Show } from "solid-js";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { Size, translateString } from "../dims";
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
        render: ({ transform, renderData }, childrenElements) => {
          const data = renderData!;
          const endAngleDeg = data.ae * (180 / Math.PI);
          const sw = props.strokeWidth;
          const headPoints = [
            [0, -2],
            [4, 0],
            [0, 2],
          ]
            .map(([x, y]) => [x * sw, y * sw])
            .map((p) => p.join(","))
            .join(" ");
          return (
            <g transform={translateString(transform)}>
              <Show when={props.start} fallback={<></>}>
                <circle
                  cx={data.sx}
                  cy={data.sy}
                  r={(4 / 3) * sw}
                  fill={props.stroke}
                />
              </Show>
              <path
                d={`M${data.sx},${data.sy} Q${data.cx},${data.cy} ${data.ex},${data.ey}`}
                fill="none"
                stroke={props.stroke}
                stroke-width={sw}
              />
              <polygon
                points={headPoints}
                transform={`translate(${data.ex},${data.ey}) rotate(${endAngleDeg})`}
                fill={props.stroke}
              />
              {childrenElements}
            </g>
          );
        },
      },
      children
    );
  }
);

export default arrow;
