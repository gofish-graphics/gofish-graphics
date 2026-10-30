// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { DisplayList } from "gofish-ir";
import { color6, resolveColorChannel } from "../../color";
import { getValue, isValue, type MaybeValue } from "../data";
import { displayTranslate, type Dimensions } from "../dims";
import {
  boxOfDims,
  boxOutline,
  insetBox,
  insetConvex,
  outlinePaint,
  ringOutline,
  type OutlinePoint,
  type Point,
} from "../geometry";
import {
  lowerStyle,
  rectItemFromBox,
  ringItem,
  roleFor,
} from "../displayList/lowerHelpers";
import { GoFishNode, outlineOverhang } from "../_node";
import {
  pinnedSpan,
  UNDEFINED,
  type UnderlyingSpace,
} from "../underlyingSpace";
import {
  enclosingCell,
  type PositionInterval,
  type PositionRegion,
} from "../constraints/position";
import { compilePlacementCoordinate } from "../constraints/placementLowering";
import { numbers } from "../solver/arith";
import { axisName } from "../constraints/shared";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";

const DEFAULT_SIZE = 16;

/** What a region takes: paint, and how far it is drawn in from its cell's
 *  sides. Its shape is the cell it is in. */
export type RegionProps = {
  key?: string;
  /** Pixels drawn in from each side of the cell: each side the cell has,
   *  on an axis where it is in a cell (both axes of a hexagon, the
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
 * `region()`'s node (#1059): it draws the cell it is in, such as a
 * `partition`'s cell, and has no size or position of its own.
 *
 * The cell is in data (`enclosingCell`). On each axis where the region is in
 * a cell, it is placed by its data, as a rect with a data `x` and `x2` is:
 * its space is the cell's interval, pinned, and it maps the cell's edges
 * (and the outline of a cell of the plane) through the map its parent hands
 * it, the frame of the partition, which a child placed by its data shares.
 * A datum of the cell it cannot map there is an error, since its parent
 * leaves it where its data puts it. On an axis where it is in no cell, it is as long as the size it is
 * proposed, and its parent places it there, as it places a rect with no
 * size.
 *
 * It draws the cell's outline when the cell has one (a hexagon, a Voronoi
 * cell, from a `partition` over `struct({ x, y }).bin(b)`), and its box
 * otherwise, drawn in by `inset` from each side the cell gives it. Under a
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
  // The cell it is in, read when its space is resolved: the partitions
  // around it have given their children their cells by then.
  let cell: PositionRegion | undefined;
  // The outline in the node's local frame and axis order, as `layout` placed
  // it (the cell's outline less the node's translate, drawn in by `inset`),
  // or none for a box. Empty when the inset leaves nothing.
  let outline: Point[] | undefined;
  // Per axis, how far its box is drawn in at each end: `inset` where the
  // cell gives a span, else 0.
  let boxInset: [number, number] = [0, 0];
  // Without an outline, the box it draws: its box drawn in by `boxInset`.
  const drawnBox = (intrinsicDims: Dimensions, type: string) =>
    insetBox(boxOfDims(intrinsicDims, type), boxInset);

  // How it paints its outline, read once.
  const paint = outlinePaint({ fill, stroke, strokeWidth });
  const node: GoFishNode = new GoFishNode(
    {
      key,
      type: "region",
      // Labeled by its outline, as a polygon is: inside it when filled.
      labelPosition: "outline",
      args: { key, fill, stroke, strokeWidth, opacity, filter, inset },
      // Used to seed the unit color scale. Prefer whichever channel is
      // data-driven, as `rect` does.
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: () => {
        cell = enclosingCell(node);
        const axisSpace = (axis: 0 | 1): UnderlyingSpace => {
          const span = cell?.spans[axis];
          if (span === undefined) return UNDEFINED;
          return pinnedSpan(
            span[0],
            span[1],
            axis,
            "between a region's two edges"
          );
        };
        return [axisSpace(0), axisSpace(1)];
      },
      layout: (size, scales) => {
        // A datum of the cell through the map its parent hands it. Its space
        // claimed the cell on this axis, pinned, so its parent treats it as
        // placed by its data there: a datum it cannot map would leave it
        // nowhere, so that is an error, not a guess.
        const px = (axis: 0 | 1, v: PositionInterval[number], what: string) => {
          const p = compilePlacementCoordinate(numbers, v, scales[axis]?.map);
          if (p === undefined || !Number.isFinite(p))
            throw new Error(
              `region: its cell's ${what} on ${axisName(axis)} does not map ` +
                `to pixels: ${
                  scales[axis]?.map === undefined
                    ? `the region's parent gives it no map for its cell's data on ${axisName(axis)}`
                    : p === undefined
                      ? `its datum ${getValue(v as MaybeValue<number>)} is not a number`
                      : `it maps to ${p}`
                }. A region is placed by its cell's data, so it must share ` +
                `the frame of the partition that gives it the cell (an ` +
                `operator between them that places its children on ` +
                `${axisName(axis)}, such as a spread, takes that frame away).`
            );
          return p;
        };
        const extent = (axis: 0 | 1) => {
          const span = cell?.spans[axis];
          if (span !== undefined) {
            const a = px(axis, span[0], "first edge");
            const b = px(axis, span[1], "second edge");
            const min = Math.min(a, b);
            return { min: 0, size: Math.max(a, b) - min, translate: min };
          }
          const s = size[axis];
          return {
            min: 0,
            size: Number.isFinite(s) ? s : DEFAULT_SIZE,
            translate: undefined,
          };
        };
        const [x, y] = [extent(0), extent(1)];
        boxInset = [
          x.translate === undefined ? 0 : inset,
          y.translate === undefined ? 0 : inset,
        ];
        // The cell's outline in the node's local frame. A cell has one only
        // when it is placed along both axes (`PositionRegion`), so both
        // edges mapped above, and each corner maps or throws.
        const ring = cell?.outline?.map(
          ([vx, vy]): OutlinePoint => [
            px(0, vx, "outline") - x.translate!,
            px(1, vy, "outline") - y.translate!,
          ]
        );
        outline =
          ring === undefined || inset === 0 ? ring : insetConvex(ring, inset);
        if (outline === undefined && ring !== undefined)
          // TODO(#1201): drawing in a ring that is not convex needs a
          // general polygon offset. Every partition cell is convex.
          throw new Error(
            "region: inset needs a convex cell; this cell's outline is not " +
              "convex (#1201)."
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
        // A cell thinner than twice the inset draws nothing.
        const drawn = drawnBox(intrinsicDims!, node.type);
        if (outline !== undefined ? outline.length < 3 : drawn.empty) return [];
        // The drawn box where its parent placed it.
        const [tx, ty] = displayTranslate(transform);
        const [x0, x1] = [drawn.box.min[0] + tx, drawn.box.max[0] + tx];
        const [y0, y1] = [drawn.box.min[1] + ty, drawn.box.max[1] + ty];
        if (outline === undefined && linear)
          return [
            rectItemFromBox(x0, x1, y0, y1, toPixel, {
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
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
              ];
        return [
          ringItem(points, coordinateTransform, toPixel, node.datum, style),
        ];
      },
      // Its outline is what it draws: the cell's outline when it has one,
      // and its box otherwise, drawn in by its inset. It traces the cell
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
        const drawn = drawnBox(intrinsicDims, node.type);
        return {
          box,
          outline: () =>
            drawn.empty ? [] : [boxOutline(drawn.box, direction, paint)],
        };
      },
    },
    []
  );
  return node;
};

/** The `region` mark: draws the cell it is in (a partition's cell). IR type
 *  `region`. */
export const region = createMark(Region, MARK_CHANNELS.region, "region");
