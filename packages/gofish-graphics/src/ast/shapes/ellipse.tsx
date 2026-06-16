import { computeAesthetic } from "../../util";
import * as Monotonic from "../../util/monotonic";
import { color6_old, resolveColorChannel } from "../../color";
import {
  path,
  Path,
  pathToSVGPath,
  segment,
  subdividePath,
  transformPath,
} from "../../path";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { linear } from "../coordinateTransforms/linear";
import {
  getMeasure,
  getValue,
  inferEmbedded,
  isValue,
  MaybeValue,
  Value,
} from "../data";
import {
  Dimensions,
  displayDims as displayDimsOf,
  elaborateDims,
  FancyDims,
  FancySize,
  Size,
  Transform,
} from "../dims";
import { aesthetic, continuous } from "../domain";
import { interval } from "../../util/interval";
import {
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
} from "../underlyingSpace";
import { createMark } from "../withGoFish";
/* TODO: what should default embedding behavior be when all values are aesthetic? */
export const Ellipse = ({
  name,
  fill = color6_old[0],
  stroke = fill,
  strokeWidth = 0,
  aspectRatio,
  label,
  ...fancyDims
}: {
  name?: string;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  /** w/h ratio to enforce. When both dims are data-driven, the constraining axis is used. */
  aspectRatio?: number;
  label?: boolean;
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims).map(inferEmbedded);
  return new GoFishNode(
    {
      name,
      type: "ellipse",
      color: fill,
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ) => {
        let wDomain = isValue(dims[0].size)
          ? Monotonic.linear(getValue(dims[0].size!), 0)
          : Monotonic.linear(0, dims[0].size ?? 0);
        let hDomain = isValue(dims[1].size)
          ? Monotonic.linear(getValue(dims[1].size!), 0)
          : Monotonic.linear(0, dims[1].size ?? 0);
        if (aspectRatio !== undefined && aspectRatio > 0) {
          const wIsData = isValue(dims[0].size);
          const hIsData = isValue(dims[1].size);
          if (wIsData && !hIsData) {
            hDomain = Monotonic.linear(
              (wDomain as Monotonic.Linear).slope / aspectRatio,
              0
            );
          } else if (hIsData && !wIsData) {
            wDomain = Monotonic.linear(
              (hDomain as Monotonic.Linear).slope * aspectRatio,
              0
            );
          }
        }

        const resolveAxis = (
          axis: 0 | 1,
          axisDomain: Monotonic.Monotonic
        ): UnderlyingSpace => {
          const d = dims[axis];
          if (isValue(d.min)) {
            // position; treat it like a position space w/ a single element
            const min = getValue(d.min) ?? 0;
            return POSITION(interval(min, min), getMeasure(d.min));
          }
          if (isValue(d.size)) {
            // data-driven size only — literals are handled at layout time.
            return SIZE(axisDomain, getMeasure(d.size));
          }
          return UNDEFINED;
        };

        return [resolveAxis(0, wDomain), resolveAxis(1, hDomain)];
      },
      layout: (shared, size, scaleFactors, children, posScales) => {
        let w = isValue(dims[0].size)
          ? getValue(dims[0].size!) * scaleFactors[0]!
          : (dims[0].size ?? size[0]);
        let h = isValue(dims[1].size)
          ? getValue(dims[1].size!) * scaleFactors[1]!
          : (dims[1].size ?? size[1]);

        if (aspectRatio !== undefined && aspectRatio > 0) {
          const wIsData = isValue(dims[0].size);
          const hIsData = isValue(dims[1].size);

          if (wIsData && !hIsData) {
            h = w / aspectRatio;
          } else if (hIsData && !wIsData) {
            w = h * aspectRatio;
          } else {
            const containedW = Math.min(w, h * aspectRatio);
            w = containedW;
            h = containedW / aspectRatio;
          }
        }

        const x = computeAesthetic(dims[0].min, posScales[0]!, undefined);
        const y = computeAesthetic(dims[1].min, posScales[1]!, undefined);

        return {
          intrinsicDims: [
            {
              min: 0,
              size: w,
            },
            {
              min: 0,
              size: h,
            },
          ],
          transform: {
            translate: [x, y],
          },
        };
      },
      render: (
        {
          intrinsicDims,
          transform,
          coordinateTransform,
        }: {
          intrinsicDims?: Dimensions;
          transform?: Transform;
          coordinateTransform?: CoordinateTransform;
        },
        _children,
        node
      ) => {
        const space = coordinateTransform ?? linear();

        // const isDataX = isValue(dims[0].size);
        // const isDataY = isValue(dims[1].size);
        const isXEmbedded = dims[0].embedded;
        const isYEmbedded = dims[1].embedded;

        // combine intrinsicDims with transform
        // center/max derived from min+size (shared helper)
        const displayDims = displayDimsOf(intrinsicDims, transform);

        const scaleContext = node.getRenderSession().scaleContext;
        const unit = scaleContext?.unit;
        const unitColorScale = unit && "color" in unit ? unit.color : undefined;
        const originalFill = fill;
        const resolvedFill = resolveColorChannel(fill, unitColorScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitColorScale) ??
          resolvedFill ??
          "black";

        const labelText =
          label && originalFill && isValue(originalFill)
            ? String(getValue(originalFill) ?? "")
            : undefined;

        // Both dimensions are aesthetic - render as transformed point
        if (!isXEmbedded && !isYEmbedded) {
          const center: [number, number] = [
            (displayDims[0].min ?? 0) + (displayDims[0].size ?? 0) / 2,
            (displayDims[1].min ?? 0) + (displayDims[1].size ?? 0) / 2,
          ];
          const [transformedX, transformedY] = space.transform(center);
          const width = displayDims[0].size ?? 0;
          const height = displayDims[1].size ?? 0;

          return (
            <>
              <ellipse
                cx={transformedX}
                cy={transformedY}
                rx={width / 2}
                ry={height / 2}
                fill={resolvedFill}
                stroke={resolvedStroke}
                stroke-width={strokeWidth ?? 0}
              />
              {labelText && (
                <text
                  transform="scale(1, -1)"
                  x={transformedX}
                  y={-transformedY}
                  fill="white"
                  font-size="12px"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {labelText}
                </text>
              )}
            </>
          );
        }

        // One dimension is data - render as line
        if (isXEmbedded !== isYEmbedded) {
          const dataAxis = isXEmbedded ? 0 : 1;
          const aestheticAxis = isXEmbedded ? 1 : 0;
          const thickness = displayDims[aestheticAxis].size ?? 0;

          // Calculate midpoint of aesthetic axis
          const aestheticMid =
            (displayDims[aestheticAxis].min ?? 0) +
            (displayDims[aestheticAxis].size ?? 0) / 2;

          // For linear spaces, render as an ellipse spanning the data axis
          if (space.type === "linear") {
            const cx = isXEmbedded
              ? ((displayDims[0].min ?? 0) + (displayDims[0].max ?? 0)) / 2
              : aestheticMid;
            const cy = isXEmbedded
              ? aestheticMid
              : ((displayDims[1].min ?? 0) + (displayDims[1].max ?? 0)) / 2;
            const rx = isXEmbedded
              ? ((displayDims[0].max ?? 0) - (displayDims[0].min ?? 0)) / 2
              : thickness / 2;
            const ry = isXEmbedded
              ? thickness / 2
              : ((displayDims[1].max ?? 0) - (displayDims[1].min ?? 0)) / 2;
            return (
              <>
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  fill={resolvedFill}
                  stroke={resolvedStroke}
                  stroke-width={strokeWidth ?? 0}
                />
                {labelText && (
                  <text
                    transform="scale(1, -1)"
                    x={cx}
                    y={-cy}
                    fill="white"
                    font-size="12px"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {labelText}
                  </text>
                )}
              </>
            );
          }

          // Create path along midline
          const linePath = path(
            [
              [
                isXEmbedded ? (displayDims[0].min ?? 0) : aestheticMid,
                isXEmbedded ? aestheticMid : (displayDims[1].min ?? 0),
              ],
              [
                isXEmbedded ? (displayDims[0].max ?? 0) : aestheticMid,
                isXEmbedded ? aestheticMid : (displayDims[1].max ?? 0),
              ],
            ],
            { subdivision: 1000 }
          );

          // Subdivide and transform path
          const transformed = transformPath(linePath, space);

          // 0.5 removes weird white space at least for some charts
          const mid: [number, number] = [
            ((displayDims[0].min ?? 0) + (displayDims[0].max ?? 0)) / 2,
            ((displayDims[1].min ?? 0) + (displayDims[1].max ?? 0)) / 2,
          ];
          const [labelX, labelY] = space.transform(mid);
          return (
            <>
              <path
                d={pathToSVGPath(transformed)}
                stroke={resolvedStroke}
                stroke-width={thickness + 0.5}
                fill="none"
              />
              {labelText && (
                <text
                  transform="scale(1, -1)"
                  x={labelX}
                  y={-labelY}
                  fill="white"
                  font-size="12px"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {labelText}
                </text>
              )}
            </>
          );
        }

        // Both dimensions are data - render as area

        // If we're in a linear space, render as an ellipse filling the available space
        if (space.type === "linear") {
          const x = displayDims[0].min ?? 0;
          const y = displayDims[1].min ?? 0;
          const width = (displayDims[0].max ?? 0) - x;
          const height = (displayDims[1].max ?? 0) - y;
          const cx = x + width / 2;
          const cy = y + height / 2;
          return (
            <>
              <ellipse
                cx={cx}
                cy={cy}
                rx={width / 2}
                ry={height / 2}
                fill={resolvedFill}
                stroke={resolvedStroke}
                stroke-width={strokeWidth ?? 0}
              />
              {labelText && (
                <text
                  transform="scale(1, -1)"
                  x={cx}
                  y={-cy}
                  fill="white"
                  font-size="12px"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {labelText}
                </text>
              )}
            </>
          );
        }

        const corners = path(
          [
            [displayDims[0].min ?? 0, displayDims[1].min ?? 0],
            [displayDims[0].max ?? 0, displayDims[1].min ?? 0],
            [displayDims[0].max ?? 0, displayDims[1].max ?? 0],
            [displayDims[0].min ?? 0, displayDims[1].max ?? 0],
          ],
          { closed: true, subdivision: 1000 }
        );

        const transformed = transformPath(corners, space);

        const mid: [number, number] = [
          ((displayDims[0].min ?? 0) + (displayDims[0].max ?? 0)) / 2,
          ((displayDims[1].min ?? 0) + (displayDims[1].max ?? 0)) / 2,
        ];
        const [labelX, labelY] = space.transform(mid);

        return (
          <>
            <path
              d={pathToSVGPath(transformed)}
              fill={resolvedFill}
              stroke={resolvedStroke}
              stroke-width={strokeWidth ?? 0}
            />
            {labelText && (
              <text
                transform="scale(1, -1)"
                x={labelX}
                y={-labelY}
                fill="white"
                font-size="12px"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {labelText}
              </text>
            )}
          </>
        );
      },
    },
    []
  );
};

export const ellipse = createMark(
  Ellipse,
  {
    w: "size",
    h: "size",
    fill: "color",
  },
  "ellipse"
);
