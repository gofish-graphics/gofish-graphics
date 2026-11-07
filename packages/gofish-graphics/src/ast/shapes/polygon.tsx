import { getColumnTypes, setColumnTypes } from "../schema";
import { datumOfInput } from "../marks/markResult";
import { GoFishNode, outlineOverhang } from "../_node";
import {
  boxOfDims,
  outlinePaint,
  ringExtent,
  ringOutline,
  ringsEnclosingCircle,
} from "../geometry";
import { GoFishAST } from "../_ast";
import { Size } from "../dims";
import { UNDEFINED, UnderlyingSpace, CONTINUOUS } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { nameableMark, type NameableMark } from "../marks/createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import { getValue, isValue, MaybeValue, value } from "../data";
import { posFn } from "../domain";
import { interval } from "../../util/interval";
import { resolveColorChannel } from "../../color";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, outlineItem, ringItem } from "../displayList/lowerHelpers";
import {
  curve,
  quadratic,
  samePoint,
  segment,
  type Path,
  type PathSegment,
  type Point,
} from "../../path";
import { pointOrMagnitude } from "../underlyingSpace";
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
   */
  points?: MaybeValue<Ring>;
  /** PROTOTYPE (#1331): the outline as an absolute SVG path (M, L, Q, C, Z),
   *  in place of `points`. Curves are drawn like edges: under a nonlinear
   *  coordinate space the whole outline is resampled through it. */
  d?: string;
  /** PROTOTYPE (#1331): the box the outline is stretched into, like a
   *  rect's. A data value scales like a rect's width; left out, the outline
   *  keeps its own extent (or takes the room it is given when the other
   *  side is set). */
  w?: MaybeValue<number>;
  h?: MaybeValue<number>;
};

/** PROTOTYPE (#1331): parse an absolute SVG path of M/L/Q/C/Z commands into
 *  outline segments. */
export const parseOutline = (d: string): Path => {
  const out: Path = [];
  let cur: Point = [0, 0];
  let start: Point = [0, 0];
  for (const seg of d.match(/[MLQCZ][^MLQCZ]*/gi) ?? []) {
    const cmd = seg[0].toUpperCase();
    const n = (seg.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(
      Number
    );
    const pts: Point[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    if (cmd === "M") {
      cur = start = pts[0];
      for (const p of pts.slice(1)) {
        out.push(segment(cur, p));
        cur = p;
      }
    } else if (cmd === "L") {
      for (const p of pts) {
        out.push(segment(cur, p));
        cur = p;
      }
    } else if (cmd === "Q") {
      for (let i = 0; i + 1 < pts.length; i += 2) {
        out.push(quadratic(cur, pts[i], pts[i + 1]));
        cur = pts[i + 1];
      }
    } else if (cmd === "C") {
      for (let i = 0; i + 2 < pts.length; i += 3) {
        out.push(curve(cur, pts[i], pts[i + 1], pts[i + 2]));
        cur = pts[i + 2];
      }
    } else if (cmd === "Z") {
      if (!samePoint(cur, start)) out.push(segment(cur, start));
      cur = start;
    }
  }
  return out;
};

const segmentPoints = (s: PathSegment): Point[] =>
  s.type === "line"
    ? [s.points[0], s.points[1]]
    : [s.start, s.control1, s.control2, s.end];

export const mapSegment = (
  s: PathSegment,
  f: (p: Point) => Point
): PathSegment =>
  s.type === "line"
    ? segment(f(s.points[0]), f(s.points[1]))
    : curve(f(s.start), f(s.control1), f(s.control2), f(s.end));

/** A flattened ring of an outline, for geometry (labels, enclosing circle). */
const flattenOutline = (outline: Path): Ring => {
  const ring: Ring = [];
  for (const s of outline) {
    if (s.type === "line") ring.push(s.points[0]);
    else
      for (let i = 0; i < 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        ring.push([
          u * u * u * s.start[0] +
            3 * u * u * t * s.control1[0] +
            3 * u * t * t * s.control2[0] +
            t * t * t * s.end[0],
          u * u * u * s.start[1] +
            3 * u * u * t * s.control1[1] +
            3 * u * t * t * s.control2[1] +
            t * t * t * s.end[1],
        ]);
      }
  }
  return ring;
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
  d,
  w,
  h,
}: PolygonProps) => {
  const dataBound = isValue(points);
  // PROTOTYPE (#1331): an outline with a box (`w`/`h`) or a path (`d`) is
  // stretched from its own extent into that box, and drawn with its curves.
  const shaped =
    !dataBound && (d !== undefined || w !== undefined || h !== undefined);
  const baseOutline: Path | undefined = !shaped
    ? undefined
    : d !== undefined
      ? parseOutline(d)
      : (points as unknown as Ring).map((p, i, all) =>
          segment(p as Point, all[(i + 1) % all.length] as Point)
        );
  const ring: Ring = baseOutline
    ? baseOutline.flatMap(segmentPoints)
    : dataBound
      ? (getValue(points) as Ring)
      : (points as unknown as Ring);
  const outlineRef: { current: Path | undefined } = { current: baseOutline };

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
              CONTINUOUS(interval(minX, maxX), "pinned"),
              CONTINUOUS(interval(minY, maxY), "pinned"),
            ]
          : shaped
            ? [
                w !== undefined ? pointOrMagnitude(undefined, w) : UNDEFINED,
                h !== undefined ? pointOrMagnitude(undefined, h) : UNDEFINED,
              ]
            : [UNDEFINED, UNDEFINED],
      layout: (_size, scales) => {
        if (shaped && baseOutline) {
          // A side with no size of its own takes the room it is given when
          // the other side is set (as a rect does), else its own extent.
          const side = (
            v: MaybeValue<number> | undefined,
            axis: 0 | 1,
            own: number,
            other: MaybeValue<number> | undefined
          ) =>
            isValue(v)
              ? getValue(v) * (scales?.[axis]?.sigma ?? 1)
              : (v ?? (other !== undefined ? (_size?.[axis] ?? own) : own));
          const W = side(w, 0, maxX - minX, h);
          const H = side(h, 1, maxY - minY, w);
          const sx = maxX > minX ? W / (maxX - minX) : 0;
          const sy = maxY > minY ? H / (maxY - minY) : 0;
          const scaled = baseOutline.map((sg) =>
            mapSegment(sg, ([x, y]) => [(x - minX) * sx, (y - minY) * sy])
          );
          outlineRef.current = scaled;
          localRef.current = flattenOutline(scaled);
          return {
            intrinsicDims: [
              { min: 0, size: W },
              { min: 0, size: H },
            ],
            transform: { translate: [undefined, undefined] },
          };
        }
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
        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill ?? "black";
        if (outlineRef.current) {
          return [
            outlineItem(
              outlineRef.current.map((sg) => mapSegment(sg, (p) => local(p))),
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
        }
        return [
          ringItem(
            localRef.current.map((p) => local(p)),
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
      // The smallest circle through the ring's vertices (Welzl, via d3's
      // `packEnclose` over zero-radius circles), in the local frame `layout`
      // resolved the ring into. Its outline is the ring.
      geometry: ({ intrinsicDims }, _children, node) => ({
        box: boxOfDims(intrinsicDims, node.type),
        outline: () => [
          ringOutline(localRef.current, node.yFrame.direction, paint),
        ],
        enclosingCircle: () =>
          ringsEnclosingCircle([localRef.current], node.yFrame.direction),
      }),
    },
    []
  );
};

/** `fill`/`stroke` are color channels, as on `rect`: a field name (or
 *  `field(...)`) reads the row's value and goes through the chart's color
 *  scale; any other string is a literal color. */
// PROTOTYPE (#1331): `w`/`h` are size channels, as on rect.
const basePolygon = createMark(
  Polygon,
  {
    ...MARK_CHANNELS.polygon,
    w: "size",
    h: "size",
  } as typeof MARK_CHANNELS.polygon,
  "polygon"
);

export type PolygonMarkProps = Omit<
  Parameters<typeof basePolygon>[0],
  "points" | "d" | "w" | "h"
> & {
  /** A literal ring, or the name of a field holding one ring per row. */
  points?: Ring | string;
  /** PROTOTYPE (#1331): an absolute SVG path outline instead of points. */
  d?: string;
  /** PROTOTYPE (#1331): the box the outline stretches into, as on rect. */
  w?: number | string;
  h?: number | string;
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
        const node = (await basePolygon({
          ...opts,
          points: value(ring as Ring),
        } as any)(types ? setColumnTypes([row], types) : [row])) as GoFishNode;
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
