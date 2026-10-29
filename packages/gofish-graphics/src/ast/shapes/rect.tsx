// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { color6, resolveColorChannel } from "../../color";
import { path, transformPath } from "../../path";
import { GoFishNode, outlineOverhang } from "../_node";
import { GoFishAST } from "../_ast";
import { linear } from "../coordinateTransforms/linear";
import {
  getValue,
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
  deferAxisDims,
  FancyDims,
  FancySize,
  Size,
  Transform,
  centerOf,
  positionOf,
} from "../dims";
import { glyphAxis } from "../underlyingSpace";
import { literalBoxExtents } from "../extent";
import {
  boxOfDims,
  insetBox,
  outlinePaint,
  roundedBoxOutline,
} from "../geometry";
import { aesthetic, continuous, Domain, posFn, pxOf } from "../domain";
import { computeAesthetic, computeSize } from "../../util";
import {
  UNDEFINED,
  UnderlyingSpace,
  CONTINUOUS,
  magnitude,
  pinnedSpan,
  valueUnits,
} from "../underlyingSpace";
import { interval } from "../../util/interval";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";
import { attachCut } from "../graphicalOperators/cut";
import type { DisplayList } from "gofish-ir";
import {
  cornerRadii,
  lowerStyle,
  pathToPixelSVG,
  rectItemFromBox,
  roleFor,
} from "../displayList/lowerHelpers";

const DEFAULT_RECT_SIZE = 16;

/* TODO: what should default embedding behavior be when all values are aesthetic? */
export const Rect = ({
  key,
  fill = color6[0],
  stroke = fill,
  strokeWidth = 0,
  rx: rxGiven,
  ry: ryGiven,
  filter,
  opacity = 1,
  aspectRatio,
  inset = 0,
  ...fancyDims
}: {
  key?: string;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  rx?: number;
  ry?: number;
  filter?: string;
  opacity?: number;
  /** w/h ratio to enforce. w = h * aspectRatio. When both dims are data-driven,
   *  the constraining axis (smaller of the two scaled sizes) is used. */
  aspectRatio?: number;
  /** Pixels drawn in from each side of the space the rect fills: on an axis
   *  where it has no size or span of its own (a bar's width in a `spread` or
   *  a `partition` cell), so neighbors are drawn apart. A side the rect sizes
   *  itself (a bar's data height) is never inset. Paint only: the rect's
   *  box, which layout and refs read, stays the space it was given. */
  inset?: number;
} & FancyDims<MaybeValue<number>>) => {
  // `embedded` is authored by the resolveEmbedding pass (after underlying-space
  // resolves the axis measure), not inferred here — see _node.resolveEmbedding.
  const dims = elaborateDims(fancyDims);
  const { rx, ry } = cornerRadii(rxGiven, ryGiven, 0);
  if (!(Number.isFinite(inset) && inset >= 0))
    throw new Error(
      `rect: inset must be a number of pixels, 0 or more, got ${inset}.`
    );
  // Whether the rect fills the space its parent gives it on `axis`: it sets
  // no size and no span there (read after the resolveAliases pass, which
  // writes the axis-name-keyed `dims` onto `dims`).
  const fills = (axis: 0 | 1): boolean =>
    dims[axis].size === undefined &&
    !(dims[axis].min !== undefined && dims[axis].max !== undefined);
  // How far it is drawn in at each end of each axis: `inset` on an axis it
  // fills, else 0.
  const insets = (): [number, number] => [
    fills(0) ? inset : 0,
    fills(1) ? inset : 0,
  ];
  // How it paints its outline, read once.
  const paint = outlinePaint({ fill, stroke, strokeWidth });
  const node = new GoFishNode(
    {
      key,
      type: "rect",
      args: {
        key,
        fill,
        stroke,
        strokeWidth,
        rx,
        ry,
        filter,
        opacity,
        dims,
      },
      // Used to seed the unit color scale. Prefer whichever channel is data-driven.
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: readonly GoFishAST[]
      ) => {
        const resolveAxis = (axis: 0 | 1): UnderlyingSpace => {
          const d = dims[axis];
          // A box placed by its center is a glyph, as a text or an image is.
          const center = centerOf(d);
          if (center !== undefined) return glyphAxis(center, d.size);
          if (isValue(d.min) && isValue(d.max))
            return pinnedSpan(d.min, d.max, axis, "between a rect's two ends");
          if (!isValue(d.min) && !isValue(d.size)) {
            // Nothing data-driven on this axis. Literal pixel sizes are
            // handled at layout time by computeAesthetic, so contribute
            // nothing to the underlying-space tree.
            return UNDEFINED;
          }
          if (isAesthetic(d.min) && isValue(d.size)) {
            return magnitude(d.size, "none");
          }
          if (!isValue(d.min) && isValue(d.size)) {
            // No data position; data-driven size → a span from the baseline,
            // signed: a negative value extends below it (#773).
            return magnitude(d.size);
          }
          // has position (data-driven), maybe with literal/no size → POSITION.
          const min = isValue(d.min) ? getValue(d.min)! : 0;
          const size = isValue(d.size) ? getValue(d.size)! : 0;
          return CONTINUOUS(
            interval(min, min + size),
            "pinned",
            valueUnits(d.min)
          );
        };

        return [resolveAxis(0), resolveAxis(1)];
      },
      // A literal pixel size is the rect's own (#493): it claims it, so
      // whatever composes it leaves it room.
      resolveExtent: (_ce, _cs, spaces) =>
        literalBoxExtents(spaces, [dims[0], dims[1]], aspectRatio),
      layout: (size, scales, children) => {
        const pos = [posFn(scales?.[0]?.map), posFn(scales?.[1]?.map)];
        // The box's pixel size on one axis.
        const sizeOn = (k: 0 | 1): number => {
          const d = dims[k];
          const at = (v: MaybeValue<number> | undefined) =>
            computeAesthetic(v, pos[k], undefined)!;
          const map = scales?.[k]?.map;
          let s: number | undefined;
          if (isValue(d.min) && isValue(d.max)) {
            // Both ends are values: the box spans [min, max] in data space.
            s = at(d.max) - at(d.min);
          } else if (isValue(d.min) && isValue(d.size)) {
            // A data start and size: map both ends, then subtract.
            s = at(value(getValue(d.min)! + getValue(d.size)!)) - at(d.min);
          } else if (isValue(d.size) && map) {
            // A data size with no start: measured from the baseline, data 0,
            // through the map.
            s = pxOf(map, getValue(d.size)!) - pxOf(map, 0);
          } else {
            s = computeSize(d.size, scales?.[k]?.sigma!, size[k]);
          }
          // When parent constraints are unresolved and the size is
          // unspecified, keep a visible default instead of propagating
          // undefined.
          return s === undefined || !Number.isFinite(s) ? DEFAULT_RECT_SIZE : s;
        };
        let w = sizeOn(0);
        let h = sizeOn(1);

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

        const x = positionOf(dims[0], pos[0], w / 2);
        const y = positionOf(dims[1], pos[1], h / 2);

        return {
          intrinsicDims: {
            0: {
              // Store the box canonically: true min + unsigned extent. A
              // negative bar grows downward, so its min is the negative
              // endpoint and its size is the magnitude. Every derivation site
              // (`localAnchorPoint`, `displayDims`, the `dims` getters) then
              // reads a non-negative `size` and never needs `Math.abs`.
              min: Math.min(0, w),
              size: Math.abs(w),
              embedded: dims[0].embedded,
            },
            1: {
              min: Math.min(0, h),
              size: Math.abs(h),
              embedded: dims[1].embedded,
            },
          },
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
        const isXEmbedded = intrinsicDims![0].embedded;
        const isYEmbedded = intrinsicDims![1].embedded;
        // Its box where its parent placed it, drawn in by its insets.
        const by = insets();
        const placed = displayDimsOf(intrinsicDims, transform);
        const { box: drawn } = insetBox(
          {
            min: [placed[0].min, placed[1].min],
            max: [placed[0].max, placed[1].max],
          },
          by
        );
        const displayDims = placed.map((d, axis) => {
          if (by[axis] === 0) return d;
          const [min, max] = [drawn.min[axis], drawn.max[axis]];
          return { min, max, center: (min + max) / 2, size: max - min };
        });

        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";

        const elementStyle = lowerStyle({
          fill: resolvedFill,
          stroke: resolvedStroke,
          strokeWidth: strokeWidth ?? 0,
          opacity,
          filter,
        });
        const rectExtra = {
          rx,
          ry,
          style: elementStyle,
          datum: node.datum,
          role: roleFor(node.datum),
        };

        // Both dimensions aesthetic — transformed point.
        if (!isXEmbedded && !isYEmbedded) {
          const center: [number, number] = [
            displayDims[0].center ?? 0,
            displayDims[1].center ?? 0,
          ];
          const [tX, tY] = space.transform(center);
          const w = displayDims[0].size ?? 0;
          const h = displayDims[1].size ?? 0;
          return [
            rectItemFromBox(
              tX - w / 2,
              tX + w / 2,
              tY - h / 2,
              tY + h / 2,
              toPixel,
              rectExtra
            ),
          ];
        }

        // One dimension data — line.
        if (isXEmbedded !== isYEmbedded) {
          const aestheticAxis = isXEmbedded ? 1 : 0;
          const thickness = displayDims[aestheticAxis].size ?? 0;
          const aestheticMid = displayDims[aestheticAxis].center ?? 0;

          if (space.type === "linear") {
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
            return [
              rectItemFromBox(x, x + width, y, y + height, toPixel, rectExtra),
            ];
          }

          // Nonlinear — line path along the midline.
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
          const transformed = transformPath(linePath, space, {
            resample: true,
          });
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
                filter,
              }),
            },
          ];
        }

        // Both dimensions data — area.
        if (space.type === "linear") {
          const x = displayDims[0].min ?? 0;
          const y = displayDims[1].min ?? 0;
          const xMax = displayDims[0].max ?? 0;
          const yMax = displayDims[1].max ?? 0;
          return [rectItemFromBox(x, xMax, y, yMax, toPixel, rectExtra)];
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
        const transformed = transformPath(corners, space, { resample: true });
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
              filter,
            }),
          },
        ];
      },
      // Its outline is what it draws: its box drawn in by its insets, with
      // its corners rounded (see `roundedBoxOutline`), painted as it is
      // drawn: filled unless its fill is "none" or "transparent", and
      // stroked as wide as `strokeWidth`.
      geometry: ({ intrinsicDims }, _children, node) => {
        const box = boxOfDims(intrinsicDims, node.type);
        const { box: drawn } = insetBox(box, insets());
        return {
          box,
          outline: (tolerance) => [
            roundedBoxOutline(
              drawn,
              rx,
              ry,
              node.yFrame.direction,
              tolerance,
              paint
            ),
          ],
        };
      },
    },
    []
  );
  // Defer the axis-name-keyed `dims` option to the resolveAliases pass.
  node._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
  return node;
};

const baseRect = createMark(Rect, MARK_CHANNELS.rect, "rect");

export const rect: typeof baseRect = ((opts: any) =>
  attachCut(baseRect(opts))) as typeof baseRect;

/**
 * `blank()`'s node: a rect in every respect that matters to the pipeline —
 * same dims, same underlying-space resolution, same layout, same datum, so it
 * anchors refs and fuses exactly as a rect does — except that it DRAWS
 * NOTHING. Invisibility is structural, not a paint style: the node emits no
 * display items at all (`INTERNAL_emitNothing`), the same rule `GoFishRef`
 * already follows as a placement stand-in. One rule, no flag — there is no
 * configuration under which a blank paints, so `blank()` accepts no paint-only
 * options (stroke, corner radius); its `fill` only seeds the color scale.
 *
 * This is what keeps an anchor tier free: the blank-fusion rewrite
 * (`.mark(line(opts))` ⇒ `.mark(blank(anchor)).layer(line(opts))`, see
 * `marks/chart.ts`) synthesizes one anchor per row, and a 26k-row chart used
 * to pay for 26k invisible zero-size `<rect>`s in the DOM — and 26k entries in
 * the interaction hit-test map.
 */
export const Blank = (opts: Parameters<typeof Rect>[0]): GoFishNode => {
  const node = Rect(opts);
  node.type = "blank";
  node.INTERNAL_emitNothing();
  return node;
};

/** The `blank` mark factory — `marks/chart.ts`'s `blank()` is the typed,
 *  documented front for this. Its channels are the ones `blank()` takes: a
 *  data-driven `w`/`h`, and a `fill` that still seeds the unit color scale.
 *  IR type `blank`. */
export const baseBlank = createMark(Blank, MARK_CHANNELS.blank, "blank");
