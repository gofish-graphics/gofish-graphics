import { copyColumnTypes } from "../schema";
import { packEnclose } from "d3-hierarchy";
import { GoFishNode } from "../_node";
import { boxOfDims } from "../geometry";
import { GoFishAST } from "../_ast";
import { Size } from "../dims";
import { UNDEFINED, UnderlyingSpace, CONTINUOUS } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { nameableMark, type NameableMark } from "../marks/createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import { getValue, isValue, MaybeValue, value } from "../data";
import { posFn } from "../domain";
import { interval } from "../../util/interval";
import { path, transformPath } from "../../path";
import { resolveColorChannel } from "../../color";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import { withWire } from "../wire";
import { MARK_CHANNELS } from "../markChannels.generated";

export type Ring = [number, number][];

/**
 * A ring's axis-aligned extent, in one pass. (`Math.min(...ring.map(...))` reads
 * nicely but allocates two arrays per axis and blows the argument limit on a
 * detailed coastline.)
 */
const ringExtent = (
  ring: Ring
): { minX: number; maxX: number; minY: number; maxY: number } => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
};

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
   */
  points: MaybeValue<Ring>;
};

/**
 * A closed polygon.
 *
 * With literal points it is a local-coordinate shape (in the axis order of the
 * polygon's own frame: pixels, y down) whose bounding box comes from the points and whose placement comes from the parent
 * constraint system. With data-bound points (a `value(ring)`) it is a
 * data-positioned mark: it declares a POSITION space per axis spanning the
 * ring's extent, maps its vertices through the axis scales, and self-places at
 * its own low corner — which is how a country outline lands in the right place
 * under a `geo` coordinate space.
 */
export const Polygon = ({
  fill = "black",
  stroke = fill,
  strokeWidth = 0,
  opacity = 1,
  points,
}: PolygonProps) => {
  const dataBound = isValue(points);
  const ring: Ring = dataBound ? (getValue(points) as Ring) : (points as Ring);

  // Without an explicit guard an empty ring's extent is (Infinity, -Infinity),
  // producing a bbox with size: -Infinity that silently corrupts downstream
  // layout. Three points is the closed-polygon floor.
  if (ring.length < 3) {
    throw new Error(`polygon requires at least 3 points, got ${ring.length}`);
  }
  const { minX, maxX, minY, maxY } = ringExtent(ring);

  // The vertices in LOCAL coordinates, in the polygon's own axis order, as
  // `layout` resolved them: the literal points, or — when data-bound — the
  // scaled points minus the node's own translate. `lower` and `geometry` read
  // this, in pixels (y times the polygon's direction), so they emit exactly
  // what layout measured.
  const localRef: { current: Ring } = { current: ring };

  return new GoFishNode(
    {
      type: "polygon",
      // Used to seed the unit color scale. Prefer whichever channel is
      // data-driven — the same rule `rect` follows.
      color: isValue(fill) ? fill : stroke,
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ): Size<UnderlyingSpace> =>
        dataBound
          ? [
              CONTINUOUS(interval(minX, maxX), "pinned"),
              CONTINUOUS(interval(minY, maxY), "pinned"),
            ]
          : [UNDEFINED, UNDEFINED],
      layout: (_shared, _size, scales) => {
        if (!dataBound) {
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
        // One array for the whole mapping: scale in place, take the extent, then
        // rebase the same points onto the node's own low corner.
        const mapped: Ring = new Array(ring.length);
        for (let i = 0; i < ring.length; i++) {
          mapped[i] = [mapX(ring[i][0]), mapY(ring[i][1])];
        }
        const { minX: tx, maxX: hiX, minY: ty, maxY: hiY } = ringExtent(mapped);
        for (const p of mapped) {
          p[0] -= tx;
          p[1] -= ty;
        }
        localRef.current = mapped;
        return {
          intrinsicDims: [
            { min: 0, size: hiX - tx },
            { min: 0, size: hiY - ty },
          ],
          transform: { translate: [tx, ty] },
        };
      },
      // IR lowering: a local point in axis order maps to its pixel through
      // the node's `local` map. Under a nonlinear coordinate space the edges are
      // adaptively resampled so a straight edge in data space draws as the
      // curve the projection makes of it — a country outline, not its
      // vertices joined.
      lower: (
        { coordinateTransform, toPixel, local },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const displayPoints: Ring = localRef.current.map((p) => local(p));
        const nonlinear =
          coordinateTransform !== undefined &&
          coordinateTransform.type !== "linear";
        const poly = nonlinear
          ? transformPath(
              path(displayPoints, { closed: true }),
              coordinateTransform,
              { resample: true }
            )
          : path(displayPoints, { closed: true });
        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";
        return [
          {
            kind: "path",
            d: pathToPixelSVG(poly, toPixel),
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
      // The smallest circle through the ring's vertices (Welzl, via d3's
      // `packEnclose` over zero-radius circles), in the local frame `layout`
      // resolved the ring into.
      geometry: ({ intrinsicDims }, _children, node) => ({
        box: boxOfDims(intrinsicDims, node.type),
        enclosingCircle: () => {
          const d = node.yFrame.direction;
          const e = packEnclose(
            localRef.current.map(([x, y]) => ({ x, y: d * y, r: 0 }))
          );
          return { cx: e.x, cy: e.y, r: e.r };
        },
      }),
    },
    []
  );
};

/** `fill`/`stroke` are color channels, as on `rect`: a field name (or
 *  `field(...)`) reads the row's value and goes through the chart's color
 *  scale; any other string is a literal color. */
const basePolygon = createMark(Polygon, MARK_CHANNELS.polygon, "polygon");

export type PolygonMarkProps = Omit<
  Parameters<typeof basePolygon>[0],
  "points"
> & {
  /** A literal ring, or the name of a field holding one ring per row. */
  points: Ring | string;
};

/**
 * `polygon` — a closed ring, either literal or field-bound.
 *
 * `points: [[x, y], …]` is the local-coordinate shape. `points: "ring"` reads
 * the ring off each row of the mark's data, so one row is one ring and a whole
 * basemap is `chart(world110m).mark(polygon({ points: "ring" }))`. Field-bound
 * rings are data positions: they go through the axis scales and, under a `geo`
 * space, land at their own longitude and latitude.
 */
export const polygon = (opts: PolygonMarkProps): NameableMark<any> => {
  if (typeof opts.points !== "string") {
    return basePolygon(opts as any);
  }
  const field = opts.points;
  const mark = async (rows: any[]) => {
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
        const node = (await basePolygon({
          ...opts,
          points: value(ring as Ring),
        } as any)(copyColumnTypes([row], rows))) as GoFishNode;
        node.name("");
        return node;
      })
    );
    if (nodes.length === 1) return nodes[0];
    const group = (await Layer({}, nodes)) as GoFishNode;
    group.datum = rows;
    return group;
  };
  const result = nameableMark(mark);
  withWire(result, { type: "polygon", opts });
  return result;
};
