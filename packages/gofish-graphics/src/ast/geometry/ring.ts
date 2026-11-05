// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * The shape of the space a parent hands its child at layout (#1222).
 *
 * A parent proposes each child a size, `[w, h]`, the box the child is laid
 * out in. It may also hand it a SHAPE: a convex ring inside that box, in
 * the child's local frame and axis order, with the box at `[0, w] × [0, h]`.
 * No shape means the box itself. A child that fills its space (a `treemap`,
 * a `region`) fills the shape; any other child reads only the box.
 *
 * Three parents make a shape: a `treemap` hands each child its cell (a
 * polygon under `Tile.voronoi`, its box under a rectangular tiling), a
 * `partition` of the plane hands each child its cell's outline
 * (`buildChildSpans`), and an `enclose` around a child that fills its space
 * hands it its own shape. A `layer` hands its shape on to each child it
 * proposes its own box.
 */
import { ellipseRing, type Point } from "./outline";
import { signedArea2 } from "./plane";
import { ringExtent } from "./box";

/** A convex ring: a list of points with no repeated closing point. */
export type Ring = readonly Point[];

/** The box `[0, w] × [0, h]` as a ring. */
export const boxRing = (w: number, h: number): Point[] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];

/** The area of a ring. */
export const ringArea = (ring: Ring): number => Math.abs(signedArea2(ring)) / 2;

/** Whether a ring has any area: at least three points enclosing more than
 *  a rounding error. A ring with none (a tile rounded to no width, a cell
 *  its spacing ate) holds nothing, as an empty ring does. */
export const hasArea = (ring: Ring): boolean =>
  ring.length >= 3 && ringArea(ring) > 5e-10;

/** The centroid of a ring's area (its first point when it has none). */
export function ringCentroid(ring: Ring): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-12) return ring[0] ?? [0, 0];
  return [cx / (3 * a), cy / (3 * a)];
}

/** How far, in pixels, the sides of an {@link ovalRing} may stray from
 *  the oval. */
const OVAL_TOLERANCE = 0.25;

/** The oval inscribed in the box `[0, w] × [0, h]`, as a convex ring
 *  ({@link ellipseRing}). */
export const ovalRing = (w: number, h: number): Point[] =>
  ellipseRing(w / 2, h / 2, w / 2, h / 2, OVAL_TOLERANCE);

/** Whether `ring` is the whole box `[0, w] × [0, h]`, within `eps`: a
 *  shape a rectangular tiling can tile, since it is the box it reads. */
export function isWholeBox(
  ring: Ring | undefined,
  w: number,
  h: number,
  eps = 1e-6
): boolean {
  if (ring === undefined) return true;
  const { minX, maxX, minY, maxY } = ringExtent(ring);
  return (
    Math.abs(minX) <= eps &&
    Math.abs(minY) <= eps &&
    Math.abs(maxX - w) <= eps &&
    Math.abs(maxY - h) <= eps &&
    Math.abs(ringArea(ring) - w * h) <= eps * Math.max(1, w + h)
  );
}

/**
 * A ring placed in a parent's frame, as a child sees it: the box that holds
 * it (its corner `at` and its `size`) and the ring in that box's frame,
 * with the box at `[0, w] × [0, h]`. A parent lays the child out at `size`
 * with that ring as its shape, and places it at `at`.
 */
export function inItsBox(ring: Ring): {
  at: [number, number];
  size: [number, number];
  ring: Point[];
} {
  const { minX, maxX, minY, maxY } = ringExtent(ring);
  return {
    at: [minX, minY],
    size: [maxX - minX, maxY - minY],
    ring: ring.map(([x, y]) => [x - minX, y - minY] as const),
  };
}
