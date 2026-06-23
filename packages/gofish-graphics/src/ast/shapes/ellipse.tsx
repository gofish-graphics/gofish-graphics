import { computeAesthetic } from "../../util";
import * as Monotonic from "../../util/monotonic";
import { color6_old, resolveColorChannel } from "../../color";
import { path, transformPath } from "../../path";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
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
  extractAliasCandidates,
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
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  valueLabelItems,
} from "../displayList/lowerHelpers";
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
  const node = new GoFishNode(
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
        const originalFill = fill;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";

        const labelText =
          label && originalFill && isValue(originalFill)
            ? String(getValue(originalFill) ?? "")
            : undefined;

        // The inline value-label (the `label` arg) — white text at the mark's
        // center. Mirrors the `<text>` each render branch emits. `cx`/`cy` are
        // the same display-space center coords render passed to the `<text>`;
        // `toPixel` applies the y-flip the legacy `scale(1, -1)` did.
        const valueLabel = (cx: number, cy: number) =>
          valueLabelItems(labelText, cx, cy, toPixel);

        const elementStyle = lowerStyle({
          fill: resolvedFill,
          stroke: resolvedStroke,
          strokeWidth: strokeWidth ?? 0,
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
            role: "node",
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
            ...valueLabel(transformedX, transformedY),
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
            return [ellipseItem(cx, cy, rx, ry), ...valueLabel(cx, cy)];
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

          const mid: [number, number] = [
            ((displayDims[0].min ?? 0) + (displayDims[0].max ?? 0)) / 2,
            ((displayDims[1].min ?? 0) + (displayDims[1].max ?? 0)) / 2,
          ];
          const [labelX, labelY] = space.transform(mid);
          return [
            {
              kind: "path",
              d: pathToPixelSVG(transformed, toPixel),
              datum: node.datum,
              role: "node",
              style: lowerStyle({
                fill: "none",
                stroke: resolvedStroke,
                strokeWidth: thickness + 0.5,
              }),
            },
            ...valueLabel(labelX, labelY),
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
          return [
            ellipseItem(cx, cy, width / 2, height / 2),
            ...valueLabel(cx, cy),
          ];
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
        return [
          {
            kind: "path",
            d: pathToPixelSVG(transformed, toPixel),
            datum: node.datum,
            role: "node",
            style: lowerStyle({
              fill: resolvedFill,
              stroke: resolvedStroke,
              strokeWidth: strokeWidth ?? 0,
            }),
          },
          ...valueLabel(labelX, labelY),
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
