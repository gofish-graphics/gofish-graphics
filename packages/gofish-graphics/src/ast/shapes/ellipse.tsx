import { computeAesthetic } from "../../util";
import * as Monotonic from "../../util/monotonic";
import { color6_old, resolveColorChannel } from "../../color";
import { path, transformPath } from "../../path";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { linear } from "../coordinateTransforms/linear";
import { getMeasure, getValue, isValue, MaybeValue, Value } from "../data";
import {
  Dimensions,
  displayDims as displayDimsOf,
  elaborateDims,
  extractAliasCandidates,
  FancyDims,
  FancySize,
  Size,
  Transform,
} from "../dims";
import { aesthetic, continuous, posFn } from "../domain";
import { interval } from "../../util/interval";
import {
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
} from "../underlyingSpace";
import { createMark } from "../withGoFish";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
/* TODO: what should default embedding behavior be when all values are aesthetic? */
export const Ellipse = ({
  fill = color6_old[0],
  stroke = fill,
  strokeWidth = 0,
  opacity = 1,
  aspectRatio,
  ...fancyDims
}: {
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
  /** w/h ratio to enforce. When both dims are data-driven, the constraining axis is used. */
  aspectRatio?: number;
} & FancyDims<MaybeValue<number>>) => {
  // `embedded` is authored by the resolveEmbedding pass — see rect.tsx.
  const dims = elaborateDims(fancyDims);
  const node = new GoFishNode(
    {
      type: "ellipse",
      // Expose `dims` so resolveAliases / resolveEmbedding can author it in place
      // (same array the closures below capture). See rect.tsx / _node passes.
      args: { dims },
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
      layout: (shared, size, scales, children) => {
        let w = isValue(dims[0].size)
          ? getValue(dims[0].size!) * scales[0]?.sigma!
          : (dims[0].size ?? size[0]);
        let h = isValue(dims[1].size)
          ? getValue(dims[1].size!) * scales[1]?.sigma!
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

        const x = computeAesthetic(
          dims[0].min,
          posFn(scales[0]?.map)!,
          undefined
        );
        const y = computeAesthetic(
          dims[1].min,
          posFn(scales[1]?.map)!,
          undefined
        );

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
      // IR lowering — the structural mirror of `render` above. Each branch
      // computes the SAME geometry, then emits display-list items (coordinates
      // pushed through `toPixel`) instead of JSX. Mirror the geometry the
      // legacy render computed.
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const space = coordinateTransform ?? linear();

        // Ellipse reads embedding from the closure `dims` (elaborateDims), not
        // from intrinsicDims (whose entries carry no `embedded` flag here).
        const isXEmbedded = dims[0].embedded;
        const isYEmbedded = dims[1].embedded;

        const displayDims = displayDimsOf(intrinsicDims, transform);

        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";

        const elementStyle = lowerStyle({
          fill: resolvedFill,
          stroke: resolvedStroke,
          strokeWidth: strokeWidth ?? 0,
          opacity,
        });

        // Build an EllipseItem from a display-space center; radii are unchanged
        // by `toPixel` (it is translate + y-flip only).
        const ellipseItem = (
          cx: number,
          cy: number,
          rx: number,
          ry: number
        ): DisplayList.EllipseItem => {
          const [px, py] = toPixel([cx, cy]);
          return {
            kind: "ellipse",
            cx: px,
            cy: py,
            rx,
            ry,
            style: elementStyle,
            datum: node.datum,
            role: roleFor(node.datum),
          };
        };

        // Both dimensions aesthetic — transformed point.
        if (!isXEmbedded && !isYEmbedded) {
          const center: [number, number] = [
            (displayDims[0].min ?? 0) + (displayDims[0].size ?? 0) / 2,
            (displayDims[1].min ?? 0) + (displayDims[1].size ?? 0) / 2,
          ];
          const [transformedX, transformedY] = space.transform(center);
          const width = displayDims[0].size ?? 0;
          const height = displayDims[1].size ?? 0;
          return [
            ellipseItem(transformedX, transformedY, width / 2, height / 2),
          ];
        }

        // One dimension data — line.
        if (isXEmbedded !== isYEmbedded) {
          const aestheticAxis = isXEmbedded ? 1 : 0;
          const thickness = displayDims[aestheticAxis].size ?? 0;
          const aestheticMid =
            (displayDims[aestheticAxis].min ?? 0) +
            (displayDims[aestheticAxis].size ?? 0) / 2;

          // For linear spaces, render as an ellipse spanning the data axis.
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
            return [ellipseItem(cx, cy, rx, ry)];
          }

          // Nonlinear — warped line path along the midline.
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
          const transformed = transformPath(linePath, space);

          return [
            {
              kind: "path",
              d: pathToPixelSVG(transformed, toPixel),
              datum: node.datum,
              role: roleFor(node.datum),
              style: lowerStyle({
                fill: "none",
                stroke: resolvedStroke,
                strokeWidth: thickness + 0.5,
                opacity,
              }),
            },
          ];
        }

        // Both dimensions data — area.
        if (space.type === "linear") {
          const x = displayDims[0].min ?? 0;
          const y = displayDims[1].min ?? 0;
          const width = (displayDims[0].max ?? 0) - x;
          const height = (displayDims[1].max ?? 0) - y;
          const cx = x + width / 2;
          const cy = y + height / 2;
          return [ellipseItem(cx, cy, width / 2, height / 2)];
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

        return [
          {
            kind: "path",
            d: pathToPixelSVG(transformed, toPixel),
            datum: node.datum,
            role: roleFor(node.datum),
            style: lowerStyle({
              fill: resolvedFill,
              stroke: resolvedStroke,
              strokeWidth: strokeWidth ?? 0,
              opacity,
            }),
          },
        ];
      },
    },
    []
  );
  // Stash alias-keyed dims (theta/r/…) for the resolveAliases pass.
  node._pendingAliases = extractAliasCandidates(fancyDims);
  return node;
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
