// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { DisplayList } from "gofish-ir";
import { color6, resolveColorChannel } from "../../color";
import { isValue, type MaybeValue } from "../data";
import { displayDims } from "../dims";
import type { Point } from "../geometry";
import {
  lowerStyle,
  rectItemFromBox,
  ringItem,
  roleFor,
} from "../displayList/lowerHelpers";
import { GoFishNode } from "../_node";
import { UNDEFINED } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";

const DEFAULT_SIZE = 16;

/** What a region takes: paint only. Its shape is the space it is given. */
export type RegionProps = {
  key?: string;
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
 * otherwise. Under a nonlinear coordinate space either one is resampled, so
 * a cell of a polar partition draws as the wedge it is.
 */
export const Region = ({
  key,
  fill = color6[0],
  stroke = fill,
  strokeWidth = 0,
  opacity = 1,
  filter,
}: RegionProps): GoFishNode => {
  // The outline in the node's local frame and axis order, as `layout` placed
  // it (the region's outline less the node's translate), or none.
  let outline: Point[] | undefined;

  return new GoFishNode(
    {
      key,
      type: "region",
      args: { key, fill, stroke, strokeWidth, opacity, filter },
      // Used to seed the unit color scale. Prefer whichever channel is
      // data-driven, as `rect` does.
      color: isValue(fill) ? fill : stroke,
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: (_shared, size, _scales, _children, _node, region) => {
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
        outline =
          region?.outline === undefined
            ? undefined
            : region.outline.map(
                ([px, py]) => [px - x.translate!, py - y.translate!] as const
              );
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
        const [dx, dy] = displayDims(intrinsicDims, transform);
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
    },
    []
  );
};

/** The `region` mark: draws the region its parent gives it (a partition's
 *  cell). IR type `region`. */
export const region = createMark(Region, MARK_CHANNELS.region, "region");
