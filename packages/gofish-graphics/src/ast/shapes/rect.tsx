// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { color6, color6_old } from "../../color";
import { path, Path, pathToSVGPath, segment, transformPath } from "../../path";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { linear } from "../coordinateTransforms/linear";
import {
  getMeasure,
  getValue,
  inferEmbedded,
  isAesthetic,
  isValue,
  MaybeValue,
  value,
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
import { aesthetic, continuous, Domain } from "../domain";
import * as Monotonic from "../../util/monotonic";
import { computeAesthetic, computeSize } from "../../util";
import {
  DIFFERENCE,
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  forgetOnConflict,
} from "../underlyingSpace";
import { interval } from "../../util/interval";
import { createMark } from "../withGoFish";
import { attachCut } from "../graphicalOperators/cut";

const computeIntrinsicSize = (
  input: MaybeValue<number> | undefined
): Monotonic.Monotonic => {
  return isValue(input)
    ? Monotonic.linear(getValue(input)!, 0)
    : Monotonic.linear(0, input ?? 0);
};

const DEFAULT_RECT_SIZE = 16;

/* TODO: what should default embedding behavior be when all values are aesthetic? */
export const Rect = ({
  key,
  name,
  fill = color6[0],
  stroke = fill,
  strokeWidth = 0,
  rx = 0,
  ry = 0,
  filter,
  label,
  opacity = 1,
  aspectRatio,
  ...fancyDims
}: {
  key?: string;
  name?: string;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  rx?: number;
  ry?: number;
  filter?: string;
  label?: boolean;
  opacity?: number;
  /** w/h ratio to enforce. w = h * aspectRatio. When both dims are data-driven,
   *  the constraining axis (smaller of the two scaled sizes) is used. */
  aspectRatio?: number;
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims).map(inferEmbedded);
  return new GoFishNode(
    {
      name,
      key,
      type: "rect",
      args: {
        key,
        name,
        fill,
        stroke,
        strokeWidth,
        rx,
        ry,
        filter,
        label,
        opacity,
        dims,
      },
      // Used to seed the unit color scale. Prefer whichever channel is data-driven.
      color: isValue(fill) ? fill : stroke,
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ) => {
        // Compute per-axis SIZE Monotonic (used when the axis ends up SIZE).
        // These are the same Monotonics formerly produced by inferSizeDomains.
        let wDomain = computeIntrinsicSize(dims[0].size);
        let hDomain = computeIntrinsicSize(dims[1].size);
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
          if (isValue(d.min) && isValue(d.max)) {
            return POSITION(
              interval(getValue(d.min)!, getValue(d.max)!),
              forgetOnConflict(getMeasure(d.min), getMeasure(d.max))
            );
          }
          if (!isValue(d.min) && !isValue(d.size)) {
            // Nothing data-driven on this axis. Literal pixel sizes are
            // handled at layout time by computeAesthetic, so contribute
            // nothing to the underlying-space tree.
            return UNDEFINED;
          }
          if (isAesthetic(d.min) && isValue(d.size)) {
            return DIFFERENCE(getValue(d.size)!, getMeasure(d.size));
          }
          if (!isValue(d.min) && isValue(d.size)) {
            // No data position; data-driven size → SIZE with Monotonic.
            return SIZE(axisDomain, getMeasure(d.size));
          }
          // has position (data-driven), maybe with literal/no size → POSITION.
          const min = isValue(d.min) ? getValue(d.min)! : 0;
          const size = isValue(d.size) ? getValue(d.size)! : 0;
          return POSITION(interval(min, min + size), getMeasure(d.min));
        };

        return [resolveAxis(0, wDomain), resolveAxis(1, hDomain)];
      },
      layout: (shared, size, scaleFactors, children, posScales) => {
        let x = computeAesthetic(dims[0].min, posScales?.[0]!, undefined);
        let y = computeAesthetic(dims[1].min, posScales?.[1]!, undefined);

        let w: number | undefined;
        if (isValue(dims[0].min) && isValue(dims[0].max)) {
          // Both min and max are values -> width spans [min, max] in data space
          x = computeAesthetic(dims[0].min, posScales?.[0]!, undefined);
          const xMax = computeAesthetic(
            dims[0].max,
            posScales?.[0]!,
            undefined
          );
          // posScales[0]! above guarantees a defined scale, so
          // computeAesthetic returns a number here.
          w = xMax! - x!;
        } else if (isValue(dims[0].min) && isValue(dims[0].size)) {
          // If posScales for x exists, scale min and min+size, then subtract
          const min = x;
          const max = computeAesthetic(
            value(getValue(dims[0].min)! + getValue(dims[0].size)!),
            posScales[0]!,
            undefined
          );
          // Same invariant as the min/max branch: posScales[0]! above
          // guarantees a defined scale.
          w = max! - min!;
        } else if (isValue(dims[0].size) && posScales?.[0]) {
          // If we have size but no min, and posScales exists, use position scale
          // Treat min as 0 (baseline) and compute width from position scale
          const minPos = posScales[0](0);
          const maxPos = posScales[0](getValue(dims[0].size)!);
          w = maxPos - minPos;
        } else {
          w = computeSize(dims[0].size, scaleFactors?.[0]!, size[0]);
        }
        // When parent constraints are unresolved and rect width is unspecified,
        // keep a visible default instead of propagating undefined.
        if (w === undefined || !Number.isFinite(w)) {
          w = DEFAULT_RECT_SIZE;
        }

        let h: number | undefined;
        if (isValue(dims[1].min) && isValue(dims[1].max)) {
          // Both min and max are values -> height spans [min, max] in data space
          y = computeAesthetic(dims[1].min, posScales?.[1]!, undefined);
          const yMax = computeAesthetic(
            dims[1].max,
            posScales?.[1]!,
            undefined
          );
          // posScales[1]! above guarantees a defined scale, so
          // computeAesthetic returns a number here.
          h = yMax! - y!;
        } else if (isValue(dims[1].min) && isValue(dims[1].size)) {
          // If posScales for y exists, scale min and min+size, then subtract
          const min = y;
          const max = computeAesthetic(
            value(getValue(dims[1].min)! + getValue(dims[1].size)!),
            posScales[1]!,
            undefined
          );
          // Same invariant as the min/max branch: posScales[1]! above
          // guarantees a defined scale.
          h = max! - min!;
        } else if (isValue(dims[1].size) && posScales?.[1]) {
          // If we have size but no min, and posScales exists, use position scale
          // Treat min as 0 (baseline) and compute height from position scale
          const minPos = posScales[1](0);
          const maxPos = posScales[1](getValue(dims[1].size)!);
          h = maxPos - minPos;
        } else {
          h = computeSize(dims[1].size, scaleFactors?.[1]!, size[1]);
        }
        if (h === undefined || !Number.isFinite(h)) {
          h = DEFAULT_RECT_SIZE;
        }

        if (aspectRatio !== undefined && aspectRatio > 0) {
          const wIsData = isValue(dims[0].size);
          const hIsData = isValue(dims[1].size);

          if (wIsData && !hIsData) {
            // w is primary; derive h
            h = w / aspectRatio;
          } else if (hIsData && !wIsData) {
            // h is primary; derive w
            w = h * aspectRatio;
          } else {
            // Both data-driven or neither: contain within available space
            const containedW = Math.min(w, h * aspectRatio);
            w = containedW;
            h = containedW / aspectRatio;
          }
        }

        return {
          intrinsicDims: {
            dims: [
              {
                // Store the box canonically: true min + unsigned extent. A
                // negative bar grows downward, so its min is the negative
                // endpoint and its size is the magnitude. Every derivation site
                // (`localAnchorPoint`, `displayDims`, the `dims` getters) then
                // reads a non-negative `size` and never needs `Math.abs`.
                min: Math.min(0, w),
                size: Math.abs(w),
                embedded: dims[0].embedded,
              },
              {
                min: Math.min(0, h),
                size: Math.abs(h),
                embedded: dims[1].embedded,
              },
            ],
          },
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
        node: GoFishNode
      ) => {
        const space = coordinateTransform ?? linear();

        // const isDataX = isValue(dims[0].size);
        // const isDataY = isValue(dims[1].size);
        const isXEmbedded = intrinsicDims![0].embedded;
        const isYEmbedded = intrinsicDims![1].embedded;

        // combine intrinsicDims with transform (center/max derived from min+size)
        const displayDims = displayDimsOf(intrinsicDims, transform);

        const scaleContext = node.getRenderSession().scaleContext;
        const unit = scaleContext?.unit;
        const unitColorScale = unit && "color" in unit ? unit.color : undefined;
        const originalFill = fill;
        fill = isValue(fill)
          ? unitColorScale
            ? (unitColorScale.get(getValue(fill)) ?? getValue(fill))
            : getValue(fill)
          : fill;

        stroke = isValue(stroke)
          ? unitColorScale
            ? (unitColorScale.get(getValue(stroke)) ?? getValue(stroke))
            : getValue(stroke)
          : stroke;

        const resolvedFill = fill as string | undefined;
        const resolvedStroke =
          (stroke as string | undefined) ?? resolvedFill ?? "black";

        const labelText =
          label && originalFill && isValue(originalFill)
            ? String(getValue(originalFill) ?? "")
            : undefined;

        // Both dimensions are aesthetic - render as transformed point
        if (!isXEmbedded && !isYEmbedded) {
          const center: [number, number] = [
            displayDims[0].center ?? 0,
            displayDims[1].center ?? 0,
          ];
          const [transformedX, transformedY] = space.transform(center);
          const width = displayDims[0].size ?? 0;
          const height = displayDims[1].size ?? 0;

          return (
            <>
              <rect
                transform={`scale(1, -1)`}
                x={transformedX - width / 2}
                y={-(transformedY - height / 2) - height}
                rx={rx}
                ry={ry}
                width={width}
                height={height}
                fill={resolvedFill}
                stroke={resolvedStroke}
                stroke-width={strokeWidth ?? 0}
                filter={filter}
                opacity={opacity}
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
          const aestheticMid = displayDims[aestheticAxis].center ?? 0;

          // For linear spaces, we can render a simple line
          if (space.type === "linear") {
            // `max - min` is the unsigned extent (size), so width/height are
            // already non-negative and x/y are the box's true min corner.
            const x = isXEmbedded
              ? (displayDims[0].min ?? 0)
              : aestheticMid - thickness / 2;
            const y = isXEmbedded
              ? aestheticMid - thickness / 2
              : (displayDims[1].min ?? 0);
            const width = isXEmbedded
              ? (displayDims[0].max ?? 0) - (displayDims[0].min ?? 0)
              : thickness;
            const height = isXEmbedded
              ? thickness
              : (displayDims[1].max ?? 0) - (displayDims[1].min ?? 0);

            const center: [number, number] = [x + width / 2, y + height / 2];
            const [transformedX, transformedY] = space.transform(center);

            return (
              <>
                <rect
                  transform={`scale(1, -1)`}
                  x={x}
                  y={-y - height}
                  rx={rx}
                  ry={ry}
                  width={width}
                  height={height}
                  fill={resolvedFill}
                  stroke={resolvedStroke}
                  stroke-width={strokeWidth ?? 0}
                  filter={filter}
                  opacity={opacity}
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
            {}
          );

          // Transform path
          const transformed = transformPath(linePath, space, {
            resample: true,
          });

          // 0.5 removes weird white space at least for some charts
          return (
            <path
              d={pathToSVGPath(transformed)}
              stroke={resolvedStroke}
              stroke-width={thickness + 0.5}
              fill="none"
              filter={filter}
              opacity={opacity}
            />
          );
        }

        // Both dimensions are data - render as area

        // If we're in a linear space, render as a rect element
        if (space.type === "linear") {
          // `max - min` is the unsigned extent, so the min corner and size are
          // already correct without sign adjustment.
          const x = displayDims[0].min ?? 0;
          const y = displayDims[1].min ?? 0;
          const width = (displayDims[0].max ?? 0) - x;
          const height = (displayDims[1].max ?? 0) - y;

          const center: [number, number] = [x + width / 2, y + height / 2];
          const [transformedX, transformedY] = space.transform(center);

          return (
            <>
              <rect
                transform={`scale(1, -1)`}
                x={x}
                y={-y - height}
                rx={rx}
                ry={ry}
                width={width}
                height={height}
                stroke={resolvedStroke}
                stroke-width={strokeWidth ?? 0}
                fill={resolvedFill}
                filter={filter}
                opacity={opacity}
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

        const corners = path(
          [
            [displayDims[0].min ?? 0, displayDims[1].min ?? 0],
            [displayDims[0].max ?? 0, displayDims[1].min ?? 0],
            [displayDims[0].max ?? 0, displayDims[1].max ?? 0],
            [displayDims[0].min ?? 0, displayDims[1].max ?? 0],
          ],
          { closed: true }
        );

        // Transform path
        const transformed = transformPath(corners, space, { resample: true });

        return (
          <path
            d={pathToSVGPath(transformed)}
            fill={resolvedFill}
            stroke={resolvedStroke}
            stroke-width={strokeWidth ?? 0}
            filter={filter}
            opacity={opacity}
          />
        );
      },
    },
    []
  );
};

const baseRect = createMark(
  Rect,
  {
    w: "size",
    h: "size",
    x: "pos",
    y: "pos",
    l: "pos",
    r: "pos",
    t: "pos",
    b: "pos",
    cx: "pos",
    cy: "pos",
    fill: "color",
    stroke: "color",
  },
  "rect"
);

export const rect: typeof baseRect = ((opts: any) =>
  attachCut(baseRect(opts))) as typeof baseRect;
