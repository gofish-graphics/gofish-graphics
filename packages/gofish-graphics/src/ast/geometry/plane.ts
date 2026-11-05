/**
 * Plane geometry on points in pixels with y down: rings (closed polygons,
 * with no repeated closing point needed) and boxes turned by an angle. Shared
 * by label placement (`labels/`), `enclose`'s blob, `text` and the axes'
 * auto label angle.
 */
import type { BoundingBox } from "../../util/bbox";
import { ringExtent } from "./box";

export type PlanePoint = [number, number];

/** Twice the signed area of a ring; positive when it runs clockwise on a
 *  y-down screen. */
export function signedArea2(ring: readonly (readonly [number, number])[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/** The cross product of `b − a` and `c − a`: positive when `a`, `b`, `c`
 *  turn the way a ring with positive {@link signedArea2} winds, 0 when they
 *  are on one line. */
export function cross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number]
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** The distance from (x, y) to the segment from (ax, ay) to (bx, by). */
export const segDist = (
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number => {
  const ex = bx - ax,
    ey = by - ay,
    L = ex * ex + ey * ey;
  const t =
    L > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)) : 0;
  const dx = x - ax - t * ex,
    dy = y - ay - t * ey;
  return Math.sqrt(dx * dx + dy * dy);
};

/** Whether `p` is inside a ring (even-odd). */
export function pointInRing(
  p: readonly [number, number],
  ring: readonly (readonly [number, number])[]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

/** The winding number of rings about `p`: each ring a simple one holds
 *  counts its {@link signedArea2}'s sign, so a point is in a region of outer
 *  rings and holes (winding the other way) when it is not 0, as SVG's
 *  nonzero fill reads it; a ring that crosses itself counts each of its
 *  loops. On a ring's edge as {@link pointInRing} reads it. */
export function windingAt(
  p: readonly [number, number],
  rings: readonly (readonly (readonly [number, number])[])[]
): number {
  let w = 0;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        w += a[1] > b[1] ? 1 : -1;
    }
  return w;
}

/** Whether segments ab and cd meet. `strict`: they cross at a point inside
 *  both, each one's ends strictly on either side of the other's line.
 *  Otherwise as closed segments: they touch or cross (collinear ones when
 *  their boxes overlap). */
export function segsMeet(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
  strict: boolean
): boolean {
  const s = (p: typeof a, q: typeof a, r: typeof a) =>
    Math.sign(cross(p, q, r));
  const ab = s(a, b, c) * s(a, b, d),
    cd = s(c, d, a) * s(c, d, b);
  if (strict) return ab < 0 && cd < 0;
  return (
    ab <= 0 &&
    cd <= 0 &&
    Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
    Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
    Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
    Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
  );
}

/** `[x, y]` turned by `deg` degrees, clockwise on the screen (SVG's
 *  `rotate`), about the origin, then moved by `about`. */
export function turnPoint(
  [x, y]: readonly [number, number],
  deg: number,
  [cx, cy]: readonly [number, number] = [0, 0]
): PlanePoint {
  if (!deg) return [cx + x, cy + y];
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

/** The corners of box `b`, clockwise on the screen from its min corner,
 *  each turned by `deg` degrees about the origin and moved by `about` (see
 *  {@link turnPoint}). */
export const turnedCorners = (
  b: BoundingBox,
  deg: number,
  about?: readonly [number, number]
): PlanePoint[] =>
  (
    [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ] as const
  ).map((p) => turnPoint(p, deg, about));

/** The axis-aligned box around box `b` turned by `deg` degrees about the
 *  origin. */
export const turnedBox = (b: BoundingBox, deg: number): BoundingBox =>
  deg ? ringExtent(turnedCorners(b, deg)) : b;

/** SVG path data for a ring: one closed subpath, its points rounded to two
 *  decimals. */
export const ringPathData = (ring: readonly (readonly [number, number])[]) =>
  "M" +
  ring.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join("L") +
  "Z";
