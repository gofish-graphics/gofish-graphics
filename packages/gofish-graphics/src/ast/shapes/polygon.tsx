import { getColumnTypes, setColumnTypes } from "../schema";
import {
  callMark,
  datumOfInput,
  markContext,
  type LayerContext,
} from "../marks/markResult";
import { GoFishNode, outlineOverhang } from "../_node";
import {
  boxOfDims,
  flattenPath,
  outlinePaint,
  pathOutline,
  ringExtent,
  ringsEnclosingCircle,
} from "../geometry";
import { GoFishAST } from "../_ast";
import { signedExtent, Size, sizeOf } from "../dims";
import {
  UnderlyingSpace,
  CONTINUOUS,
  pointOrMagnitude,
} from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { nameableMark, type NameableMark } from "../marks/createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import { getValue, isValue, MaybeValue, value } from "../data";
import { posFn } from "../domain";
import { interval } from "../../util/interval";
import { resolveColorChannel } from "../../color";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, outlineItem } from "../displayList/lowerHelpers";
import {
  mapPathPoints,
  parseClosedPath,
  path,
  pathBounds,
  type Path,
  type Point,
} from "../../path";
import { withWire } from "../wire";
import { MARK_CHANNELS } from "../markChannels.generated";

export type Ring = [number, number][];

export type PolygonProps = {
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
  /**
   * The ring's vertices. Two readings, told apart the way every other channel
   * tells them apart — by the `Value` wrapper:
   *   - a plain array is in LOCAL coordinates (pixels), placed by the parent;
   *   - a `value([...])` (what a field-bound `points` produces) is in DATA
   *     coordinates, so the vertices go through the axis position scales and the
   *     polygon places itself, exactly as a data-positioned `rect` does.
   * Pass exactly one of `points` and `d`.
   */
  points?: MaybeValue<Ring>;
  /** The outline as SVG path data (absolute M, L, Q, C, Z; see
   *  `parseClosedPath`), read the way literal `points` are. */
  d?: string;
  /** The box the outline is stretched to, as a rect's. With either side
   *  given the outline is in the unit box, 0 to 1 on each axis, and a side
   *  left out fills the space it is given. */
  w?: MaybeValue<number>;
  h?: MaybeValue<number>;
};

/** The tolerance, in pixels, the outline is flattened to for its enclosing
 *  circle. Exact on straight edges. */
const CIRCLE_TOLERANCE = 0.25;

/**
 * A closed polygon.
 *
 * Its outline is `points` (straight edges) or `d` (SVG path data, with
 * curves). Three readings:
 *   - A literal outline with no `w`/`h` is a local-coordinate shape (in the
 *     axis order of the polygon's own frame: pixels, y down) whose bounding
 *     box comes from the outline and whose placement comes from the parent
 *     constraint system.
 *   - A literal outline with `w` or `h` is in the unit box, stretched to a
 *     `w` by `h` box. It declares each set side as a rect does, so it lays
 *     out like a rect of that size: a polygon in a polar slot fills the slot.
 *   - Data-bound points (a `value(ring)`) are a data-positioned mark: it
 *     declares a POSITION space per axis spanning the ring's extent, maps its
 *     vertices through the axis scales, and self-places at its own low corner
 *     — which is how a country outline lands in the right place under a `geo`
 *     coordinate space.
 * Under a nonlinear coordinate space every point of the outline goes through
 * the space, curves included (`outlineItem`).
 */
export const Polygon = ({
  fill = "black",
  stroke = fill,
  strokeWidth = 0,
  opacity = 1,
  points,
  d,
  w,
  h,
}: PolygonProps) => {
  if ((points === undefined) === (d === undefined)) {
    throw new Error(
      "polygon takes its outline as exactly one of `points` and `d`" +
        (points === undefined ? ", and got neither." : ", and got both.")
    );
  }
  const dataBound = isValue(points);
  const boxed = w !== undefined || h !== undefined;
  if (dataBound && boxed) {
    throw new Error(
      "polygon: a field-bound `points` ring is in data coordinates and places " +
        "itself, so it takes no `w` or `h`."
    );
  }
  const ring = (dataBound ? getValue(points!) : points) as Ring | undefined;
  // Without an explicit guard an empty ring's extent is (Infinity,
  // -Infinity), producing a bbox with size: -Infinity that silently
  // corrupts downstream layout. Three points is the closed-polygon floor.
  if (ring !== undefined && ring.length < 3) {
    throw new Error(`polygon requires at least 3 points, got ${ring.length}`);
  }
  const outline: Path =
    d !== undefined ? parseClosedPath(d) : path(ring!, { closed: true });
  // The outline's extent, read only where it is the polygon's own: a boxed
  // outline takes its box's.
  const bounds = boxed ? undefined : pathBounds(outline);

  // The outline in LOCAL coordinates, in the polygon's own axis order, as
  // `layout` resolved it: the literal outline, the unit outline stretched to
  // its box, or — when data-bound — the scaled outline minus the node's own
  // translate. `lower` and `geometry` read this, in pixels (y times the
  // polygon's direction), so they emit exactly what layout measured.
  const localRef: { current: Path } = { current: outline };

  // How it paints its outline, read once.
  const paint = outlinePaint({ fill, stroke, strokeWidth });
  return new GoFishNode(
    {
      type: "polygon",
      // Labeled by its outline: inside it when filled, around it when not.
      labelPosition: "outline",
      // Used to seed the unit color scale. Prefer whichever channel is
      // data-driven — the same rule `rect` follows.
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: readonly GoFishAST[]
      ): Size<UnderlyingSpace> =>
        dataBound
          ? [
              CONTINUOUS(interval(bounds!.minX, bounds!.maxX), "pinned"),
              CONTINUOUS(interval(bounds!.minY, bounds!.maxY), "pinned"),
            ]
          : // A side of the box is a size, as a rect's `w` is.
            [pointOrMagnitude(undefined, w), pointOrMagnitude(undefined, h)],
      layout: (size, scales) => {
        if (boxed) {
          // A side's signed length, read as a rect reads its own
          // (`sizeOf`): a data value from the baseline through the axis's
          // map, a number as pixels, left out the space the polygon is
          // given, and a visible default when that is unresolved.
          const W = sizeOf(w, scales?.[0], size[0]);
          const H = sizeOf(h, scales?.[1], size[1]);
          // The unit box's v runs the way the polygon's frame does: top-down
          // on a plain canvas, outward in a polar slot. TODO(#1038): whether
          // it should run from the nearest frame's baseline instead. A
          // negative side mirrors the outline, which then fills the box a
          // rect of that size has: from the negative end to 0 (#773).
          localRef.current = mapPathPoints(outline, ([x, y]) => [x * W, y * H]);
          return {
            intrinsicDims: [signedExtent(W), signedExtent(H)],
            // translate is set by the parent's constraint placement.
            transform: { translate: [undefined, undefined] },
          };
        }
        if (!dataBound) {
          const { minX, maxX, minY, maxY } = bounds!;
          return {
            intrinsicDims: [
              { min: minX, size: maxX - minX },
              { min: minY, size: maxY - minY },
            ],
            // translate is set by the parent's constraint placement.
            transform: { translate: [undefined, undefined] },
          };
        }
        // Data-bound: the axis maps take degrees (or whatever the data's units
        // are) to the enclosing scope's coordinates. Absent a map the data IS
        // the coordinate, which is the identity — the same fallback a
        // data-positioned rect takes.
        const mapX = posFn(scales?.[0]?.map) ?? ((d: number) => d);
        const mapY = posFn(scales?.[1]?.map) ?? ((d: number) => d);
        // A data-bound ring has only straight edges, so its extent is its
        // vertices'.
        const mapped = ring!.map(([x, y]): Point => [mapX(x), mapY(y)]);
        const { minX, maxX, minY, maxY } = ringExtent(mapped);
        // Rebase the mapped vertices, fresh arrays, onto the node's own low
        // corner.
        for (const p of mapped) {
          p[0] -= minX;
          p[1] -= minY;
        }
        localRef.current = path(mapped, { closed: true });
        return {
          intrinsicDims: [
            { min: 0, size: maxX - minX },
            { min: 0, size: maxY - minY },
          ],
          transform: { translate: [minX, minY] },
        };
      },
      // IR lowering: a local point in axis order maps to its pixel through
      // the node's `local` map. Under a nonlinear coordinate space the whole
      // outline, curves included, is adaptively resampled through it, so a
      // straight edge in data space draws as the curve the projection makes
      // of it: a country outline, not its vertices joined; a pie slice, not
      // its corners joined.
      lower: (
        { coordinateTransform, toPixel, local },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";
        return [
          outlineItem(
            mapPathPoints(localRef.current, local),
            coordinateTransform,
            toPixel,
            node.datum,
            lowerStyle({
              fill: resolvedFill,
              stroke: resolvedStroke,
              strokeWidth: strokeWidth ?? 0,
              opacity,
            })
          ),
        ];
      },
      // The outline, flattened to the tolerance asked for (exact on straight
      // edges), and the smallest circle through its points (Welzl, via d3's
      // `packEnclose` over zero-radius circles), in the local frame `layout`
      // resolved the outline into.
      geometry: ({ intrinsicDims }, _children, node) => ({
        box: boxOfDims(intrinsicDims, node.type),
        outline: (tolerance) => [
          pathOutline(
            localRef.current,
            tolerance,
            node.yFrame.direction,
            true,
            paint
          ),
        ],
        enclosingCircle: () =>
          ringsEnclosingCircle(
            [flattenPath(localRef.current, CIRCLE_TOLERANCE)],
            node.yFrame.direction
          ),
      }),
    },
    []
  );
};

/** `fill`/`stroke` are color channels, as on `rect`: a field name (or
 *  `field(...)`) reads the row's value and goes through the chart's color
 *  scale; any other string is a literal color. `w`/`h` are size channels, as
 *  on `rect`. */
const basePolygon = createMark(Polygon, MARK_CHANNELS.polygon, "polygon");

export type PolygonMarkProps = Omit<
  Parameters<typeof basePolygon>[0],
  "points"
> & {
  /** A literal ring, or the name of a field holding one ring per row. */
  points?: Ring | string;
};

/**
 * `polygon` — a closed outline: a literal or field-bound ring of `points`, or
 * the SVG path data `d`.
 *
 * `points: [[x, y], …]` is the local-coordinate shape, and so is `d`. With
 * `w` or `h` the literal outline is in the unit box instead, stretched to a
 * box that lays out like a rect's: `polygon({ w: "count", d })` under
 * `stack({ dir: "x" })` in a polar coord is a petal its slot bends.
 * `points: "ring"` reads the ring off each row of the mark's data, so one row
 * is one ring and a whole basemap is
 * `chart(world110m).mark(polygon({ points: "ring" }))`. Field-bound rings are
 * data positions: they go through the axis scales and, under a `geo` space,
 * land at their own longitude and latitude.
 */
export const polygon = (opts: PolygonMarkProps): NameableMark<any> => {
  if (typeof opts.points !== "string") {
    return basePolygon(opts as any);
  }
  const field = opts.points;
  const mark = async (
    rows: any[],
    _key?: string | number,
    given?: LayerContext
  ) => {
    const layerContext = markContext(given);
    const types = getColumnTypes(rows);
    const nodes = await Promise.all(
      rows.map(async (row) => {
        const ring = row?.[field];
        // Validates the ring COLUMN's value type (a field-bound `points`
        // column holds coordinate arrays), not the shape of the data.
        if (!Array.isArray(ring)) {
          throw new Error(
            `polygon({ points: "${field}" }): row has no array in field ` +
              `"${field}" — a field-bound \`points\` reads one ring per row.`
          );
        }
        // Each row is one ordinary `polygon` mark over that row's one-row
        // group `[row]`, tagged with the column types like a split leaf: the
        // mark factory resolves `fill`/`stroke` against
        // the row exactly as it does for a literal ring (and as `rect` does),
        // and the `value(...)` ring passes through as the data-bound reading.
        const node = (await callMark(
          basePolygon({ ...opts, points: value(ring as Ring) } as any),
          types ? setColumnTypes([row], types) : [row],
          undefined,
          layerContext
        )) as GoFishNode;
        node.name("");
        return node;
      })
    );
    if (nodes.length === 1) return nodes[0];
    const group = (await Layer({}, nodes)) as GoFishNode;
    group.datum = datumOfInput(rows);
    return group;
  };
  const result = nameableMark(mark);
  withWire(result, { type: "polygon", opts });
  return result;
};
