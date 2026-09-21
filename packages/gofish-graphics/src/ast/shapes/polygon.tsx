import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { displayTranslate, Size } from "../dims";
import { POSITION, UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { nameableMark, type NameableMark } from "../marks/createOperator";
import { layer as Layer } from "../graphicalOperators/layer";
import { getValue, isValue, MaybeValue, value } from "../data";
import { posFn } from "../domain";
import { interval } from "../../util/interval";
import { path, transformPath } from "../../path";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";

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
  fill?: string;
  stroke?: string;
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
 * With literal points it is a local-coordinate shape (GoFish-native y-up) whose
 * bounding box comes from the points and whose placement comes from the parent
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

  // The vertices in LOCAL coordinates, as `layout` resolved them: the literal
  // points, or — when data-bound — the scaled points minus the node's own
  // translate. `lower` reads this so it emits exactly what layout measured.
  const localRef: { current: Ring } = { current: ring };

  return new GoFishNode(
    {
      type: "polygon",
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ): Size<UnderlyingSpace> =>
        dataBound
          ? [POSITION(interval(minX, maxX)), POSITION(interval(minY, maxY))]
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
      // IR lowering — the legacy `transform="scale(1,-1)"` with each point
      // emitted as `(x+tx, -(y+ty))` folds into `toPixel`: a local point (x,y)
      // is the y-up display point (x+tx, y+ty), which `toPixel` maps to y-down
      // pixels. Under a nonlinear coordinate space the edges are adaptively
      // resampled so a straight edge in data space draws as the curve the
      // projection makes of it — a country outline, not its vertices joined.
      lower: (
        { transform, coordinateTransform, toPixel },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const [tx, ty] = displayTranslate(transform);
        const displayPoints: Ring = localRef.current.map(([x, y]) => [
          x + tx,
          y + ty,
        ]);
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
        return [
          {
            kind: "path",
            d: pathToPixelSVG(poly, toPixel),
            datum: node.datum,
            role: roleFor(node.datum),
            style: lowerStyle({
              fill,
              stroke: stroke ?? fill ?? "black",
              strokeWidth: strokeWidth ?? 0,
              opacity,
            }),
          },
        ];
      },
    },
    []
  );
};

const literalPolygon = createMark(Polygon, undefined, "polygon");

export type PolygonMarkProps = Omit<PolygonProps, "points"> & {
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
    return literalPolygon(opts as PolygonProps);
  }
  const field = opts.points;
  const mark = async (d: any) => {
    const rows: any[] = Array.isArray(d) ? d : [d];
    const nodes = rows.map((row) => {
      const ring = row?.[field];
      if (!Array.isArray(ring)) {
        throw new Error(
          `polygon({ points: "${field}" }): row has no array in field ` +
            `"${field}" — a field-bound \`points\` reads one ring per row.`
        );
      }
      const node = Polygon({ ...opts, points: value(ring as Ring) });
      node.datum = row;
      node.name("");
      return node;
    });
    if (nodes.length === 1) return nodes[0];
    const group = (await Layer({}, nodes)) as GoFishNode;
    group.datum = d;
    return group;
  };
  const result = nameableMark(mark);
  (result as any).__serialize = { type: "polygon", opts };
  return result;
};
