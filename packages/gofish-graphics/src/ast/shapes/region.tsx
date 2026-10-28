// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { DisplayList } from "gofish-ir";
import { color6, resolveColorChannel } from "../../color";
import { isValue, type MaybeValue } from "../data";
import { displayDims } from "../dims";
import {
  boxOfDims,
  boxOutline,
  insetConvex,
  isConvex,
  outlinePaint,
  ringOutline,
  type Point,
} from "../geometry";
import {
  lowerStyle,
  rectItemFromBox,
  ringItem,
  roleFor,
} from "../displayList/lowerHelpers";
import { GoFishNode, outlineOverhang } from "../_node";
import { UNDEFINED } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";

const DEFAULT_SIZE = 16;

/** What a region takes: paint, and how far it is drawn in from its cell's
 *  sides. Its shape is the space it is given. */
export type RegionProps = {
  key?: string;
  /** Pixels drawn in from each side of the cell: each side its parent
   *  gives it, on an axis where it has a span (both axes of a hexagon, the
   *  two ends of a 1D partition's cell). Paint only: its box, which layout
   *  reads, stays the cell. A cell thinner than twice the inset draws
   *  nothing. */
  inset?: number;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
  filter?: string;
};

/**
 * `region()`'s node (#1059): it draws the region its parent gives it, such as
 * a `partition`'s cell, and has no size or position of its own.
 *
 * The region comes in the layout call (`geometry/region.ts`). On each axis
 * where it has a span, the node is that span. On an axis where it has none,
 * the node is as long as the size it is proposed, and its parent places it
 * there, as it places a rect with no size.
 *
 * It draws the region's outline when the region has one (a hexagon, a
 * Voronoi cell, from a `partition` over `struct({ x, y }).bin(b)`), and its box
 * otherwise, drawn in by `inset` from each side the region gives it. Under a
 * nonlinear coordinate space either one is resampled, so a cell of a polar
 * partition draws as the wedge it is. Its outline is what it draws.
 */
export const Region = ({
  key,
  fill = color6[0],
  stroke = fill,
  strokeWidth = 0,
  opacity = 1,
  filter,
  inset = 0,
}: RegionProps): GoFishNode => {
  if (!(Number.isFinite(inset) && inset >= 0))
    throw new Error(
      `region: inset must be a number of pixels, 0 or more, got ${inset}.`
    );
  // The outline in the node's local frame and axis order, as `layout` placed
  // it (the region's outline less the node's translate, drawn in by
  // `inset`), or none for a box. Empty when the inset leaves nothing.
  let outline: Point[] | undefined;
  // Per axis, how far its box is drawn in at each end: `inset` where the
  // region gives a span, else 0.
  let boxInset: [number, number] = [0, 0];

  // How it paints its outline, read once.
  const paint = outlinePaint({ fill, stroke, strokeWidth });
  return new GoFishNode(
    {
      key,
      type: "region",
      args: { key, fill, stroke, strokeWidth, opacity, filter, inset },
      // Used to seed the unit color scale. Prefer whichever channel is
      // data-driven, as `rect` does.
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: (size, _scales, _children, _node, region) => {
        const extent = (axis: 0 | 1) => {
          const span = region?.spans[axis];
          if (span !== undefined)
            return { min: 0, size: span[1] - span[0], translate: span[0] };
          const s = size[axis];
          return {
            min: 0,
            size: Number.isFinite(s) ? s : DEFAULT_SIZE,
            translate: undefined,
          };
        };
        const [x, y] = [extent(0), extent(1)];
        if (
          region?.outline !== undefined &&
          (x.translate === undefined || y.translate === undefined)
        )
          throw new Error(
            "region: an outline needs a span on both axes (geometry/region.ts)."
          );
        boxInset = [
          x.translate === undefined ? 0 : inset,
          y.translate === undefined ? 0 : inset,
        ];
        const ring =
          region?.outline === undefined
            ? undefined
            : region.outline.map(
                ([px, py]) => [px - x.translate!, py - y.translate!] as const
              );
        if (
          ring !== undefined &&
          inset > 0 &&
          !isConvex(ring as [number, number][])
        )
          // TODO(#1201): drawing in a ring that is not convex needs a
          // general polygon offset. Every partition cell is convex.
          throw new Error(
            "region: inset needs a convex cell; this cell's outline is not " +
              "convex (#1201)."
          );
        outline =
          ring === undefined || inset === 0
            ? ring
            : insetConvex(ring as [number, number][], inset);
        return {
          intrinsicDims: [
            { min: x.min, size: x.size },
            { min: y.min, size: y.size },
          ],
          transform: { translate: [x.translate, y.translate] },
        };
      },
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel, local },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";
        const style = lowerStyle({
          fill: resolvedFill,
          stroke: resolvedStroke,
          strokeWidth: strokeWidth ?? 0,
          opacity,
          filter,
        });
        const linear =
          coordinateTransform === undefined ||
          coordinateTransform.type === "linear";
        const [fx, fy] = displayDims(intrinsicDims, transform);
        // The box drawn in by its inset (`boxInset`), about its center.
        const shrink = (d: typeof fx, by: number) => {
          const size = Math.max(0, Math.abs(d.max - d.min) - 2 * by);
          const mid = (d.min + d.max) / 2;
          return { min: mid - size / 2, max: mid + size / 2, size };
        };
        const dx = shrink(fx, boxInset[0]);
        const dy = shrink(fy, boxInset[1]);
        // A cell thinner than twice the inset draws nothing.
        if (
          outline !== undefined
            ? outline.length < 3
            : (boxInset[0] > 0 && dx.size === 0) ||
              (boxInset[1] > 0 && dy.size === 0)
        )
          return [];
        if (outline === undefined && linear)
          return [
            rectItemFromBox(dx.min, dx.max, dy.min, dy.max, toPixel, {
              rx: 0,
              ry: 0,
              style,
              datum: node.datum,
              role: roleFor(node.datum),
            }),
          ];
        // The outline in layout pixels, through the node's `local` map; the
        // box's corners when there is no outline.
        const points: [number, number][] =
          outline !== undefined
            ? outline.map(([px, py]) => local([px, py]))
            : [
                [dx.min, dy.min],
                [dx.max, dy.min],
                [dx.max, dy.max],
                [dx.min, dy.max],
              ];
        return [
          ringItem(points, coordinateTransform, toPixel, node.datum, style),
        ];
      },
      // Its outline is what it draws: the region's outline when it has one,
      // and its box otherwise, drawn in by its inset. It traces the region
      // exactly, so `intersect` can cut it.
      geometry: ({ intrinsicDims }, _children, node) => {
        const box = boxOfDims(intrinsicDims, node.type);
        const ring = outline;
        const direction = node.yFrame.direction;
        if (ring !== undefined)
          return {
            box,
            outline: () =>
              ring.length < 3 ? [] : [ringOutline(ring, direction, paint)],
          };
        const [ix, iy] = boxInset;
        const drawn = {
          min: [box.min[0] + ix, box.min[1] + iy] as [number, number],
          max: [box.max[0] - ix, box.max[1] - iy] as [number, number],
        };
        return {
          box,
          outline: () =>
            drawn.max[0] < drawn.min[0] || drawn.max[1] < drawn.min[1]
              ? []
              : [boxOutline(drawn, direction, paint)],
        };
      },
    },
    []
  );
};

/** The `region` mark: draws the region its parent gives it (a partition's
 *  cell). IR type `region`. */
export const region = createMark(Region, MARK_CHANNELS.region, "region");
