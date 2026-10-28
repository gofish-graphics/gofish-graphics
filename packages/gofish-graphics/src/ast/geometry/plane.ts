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
