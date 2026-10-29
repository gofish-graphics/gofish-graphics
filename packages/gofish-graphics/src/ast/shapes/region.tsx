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
  CONTINUOUS,
  joinUnits,
  UNDEFINED,
  valueUnits,
  type UnderlyingSpace,
} from "../underlyingSpace";
import { interval } from "../../util/interval";
import { childNameKey } from "../constraints/shared";
import type { PositionInterval, PositionRegion } from "../constraints/position";
import { compilePlacementCoordinate } from "../constraints/placementLowering";
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

/** The cell a node is in, in data: per axis, the span the nearest
 *  `partition` cell around it gives there (`PositionRegion`), and the
 *  outline of the nearest cell when that cell has one. */
type EnclosingCell = {
  spans: [PositionInterval | undefined, PositionInterval | undefined];
  outline?: PositionRegion["outline"];
};

/**
 * The cell `node` is in. A partition gives each of its children its cell in
 * a `position` constraint that names the child, so the cell of a node is the
 * one given to its nearest ancestor (or itself) that a partition names, axis
 * by axis: a partition inside another's cell gives its children both cells.
 */
function enclosingCell(node: GoFishNode): EnclosingCell {
  const cell: EnclosingCell = { spans: [undefined, undefined] };
  for (let at = node; at.parent !== undefined; at = at.parent) {
    const name = childNameKey(at);
    if (name === undefined) continue;
    for (const c of at.parent.constraints) {
      if (c.type !== "position" || c.region === undefined) continue;
      if (!c.children.some((ref) => ref?.name === name)) continue;
      if (cell.spans.every((s) => s === undefined))
        cell.outline = c.region.outline;
      cell.spans[0] ??= c.region.spans[0];
      cell.spans[1] ??= c.region.spans[1];
    }
  }
  return cell;
}

/**
 * `region()`'s node (#1059): it draws the cell it is in, such as a
 * `partition`'s cell, and has no size or position of its own.
 *
 * The cell is in data (`enclosingCell`). On each axis where the region is in
 * a cell, it is placed by its data, as a rect with a data `x` and `x2` is:
 * its space is the cell's interval, pinned, and it maps the cell's edges
 * (and the outline of a cell of the plane) through the map its parent hands
 * it, the frame of the partition, which a child placed by its data shares.
 * On an axis where it is in no cell, it is as long as the size it is
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
  let cell: EnclosingCell = { spans: [undefined, undefined] };
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
      args: { key, fill, stroke, strokeWidth, opacity, filter, inset },
      // Used to seed the unit color scale. Prefer whichever channel is
      // data-driven, as `rect` does.
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: () => {
        cell = enclosingCell(node);
        const axisSpace = (axis: 0 | 1): UnderlyingSpace => {
          const span = cell.spans[axis];
          if (span === undefined) return UNDEFINED;
          const [a, b] = [getValue(span[0])!, getValue(span[1])!];
          return CONTINUOUS(
            interval(Math.min(a, b), Math.max(a, b)),
            "pinned",
            joinUnits(valueUnits(span[0]), valueUnits(span[1]), true, {
              axis,
              where: "between a region's two edges",
            })
          );
        };
        return [axisSpace(0), axisSpace(1)];
      },
      layout: (size, scales) => {
        // A datum of the cell through the map its parent hands it.
        const px = (axis: 0 | 1, v: PositionInterval[number]) =>
          compilePlacementCoordinate(v, scales[axis]?.map);
        const extent = (axis: 0 | 1) => {
          const span = cell.spans[axis];
          const a = span && px(axis, span[0]);
          const b = span && px(axis, span[1]);
          if (a !== undefined && b !== undefined) {
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
        // The cell's outline in the node's local frame, when it is placed by
        // the cell on both axes.
        const ring =
          x.translate === undefined || y.translate === undefined
            ? undefined
            : cell.outline?.map(
                ([vx, vy]): OutlinePoint => [
                  px(0, vx)! - x.translate!,
                  px(1, vy)! - y.translate!,
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
