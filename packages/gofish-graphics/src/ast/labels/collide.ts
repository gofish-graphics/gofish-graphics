// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

/**
 * The geometry label placement runs on: polylines measured by arc length, a
 * label's turned box, and the obstacles a label must not cover, with a
 * uniform grid as the broad phase (like `overlap`'s `NeighborGrid`, but over
 * extended shapes: each obstacle is filed in every cell its box touches).
 *
 * Everything is in one frame, the frame of the layer the labels are placed
 * in, in pixels with y down.
 */

import type { Outline } from "../geometry";
import { ringExtent } from "../geometry/box";
import { outlineSegments } from "../geometry/outline";
import { pointInRing, turnedCorners } from "../geometry/plane";
import { overlaps, type BoundingBox } from "../../util/bbox";

export type Pt = [number, number];

/** A spot for a label: its center, and its angle in degrees, clockwise on
 *  the screen. */
export type Spot = { cx: number; cy: number; angle: number };

/** Half the width and height of a label's unturned box (text and chrome). */
export type HalfSize = { hx: number; hy: number };

// ── Polylines ──────────────────────────────────────────────────────────────

/** A polyline with its arc lengths. A closed one repeats its first point at
 *  the end, so its last stretch is measured too. */
export type Polyline = {
  points: Pt[];
  closed: boolean;
  /** `cum[i]` is the arc length at `points[i]`. */
  cum: number[];
  length: number;
};

/** The length of a path through `points`, back to the first when
 *  `closed`: a polyline's `length`, without building it. */
export function pathLength(points: Pt[], closed: boolean): number {
  let length = 0;
  const n = points.length;
  for (let i = 1; i < (closed && n > 0 ? n + 1 : n); i++) {
    const p = points[i - 1];
    const q = points[i % n];
    length += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return length;
}

export function polyline(points: Pt[], closed: boolean): Polyline {
  const pts = closed && points.length > 0 ? [...points, points[0]] : points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    );
  return { points: pts, closed, cum, length: cum[cum.length - 1] ?? 0 };
}

/** The index of the stretch `[i, i + 1]` that holds arc length `s`. */
function stretchAt(p: Polyline, s: number): number {
  let lo = 0;
  let hi = p.cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/** Arc length `s` brought onto the polyline: wrapped around a closed one,
 *  clamped to an open one. */
export const wrapLength = (p: Polyline, s: number): number =>
  p.closed && p.length > 0
    ? ((s % p.length) + p.length) % p.length
    : Math.min(Math.max(s, 0), p.length);

/** The point at arc length `s`. */
export function pointAt(p: Polyline, s: number): Pt {
  if (p.points.length === 1) return p.points[0];
  s = wrapLength(p, s);
  const i = stretchAt(p, s);
  const a = p.points[i];
  const b = p.points[i + 1];
  const seg = p.cum[i + 1] - p.cum[i];
  const u = seg === 0 ? 0 : (s - p.cum[i]) / seg;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** The points of the polyline between arc lengths `s0 < s1`, ends
 *  included. On a closed polyline the stretch may run past its start. */
export function pointsBetween(p: Polyline, s0: number, s1: number): Pt[] {
  const out: Pt[] = [pointAt(p, s0)];
  if (p.closed) {
    // Walk the vertices passed, wrapping around.
    const L = p.length;
    for (const base of [Math.floor(s0 / L) * L, Math.floor(s0 / L) * L + L])
      for (let i = 0; i < p.points.length - 1; i++) {
        const s = base + p.cum[i];
        if (s > s0 && s < s1) out.push(p.points[i]);
      }
  } else {
    for (let i = 1; i < p.points.length - 1; i++)
      if (p.cum[i] > s0 && p.cum[i] < s1) out.push(p.points[i]);
  }
  out.push(pointAt(p, s1));
  return out;
}

// ── A label's box ──────────────────────────────────────────────────────────

/** The corners of a label's box at a spot, grown by `pad` on every side. */
export const corners = (spot: Spot, size: HalfSize, pad = 0): Pt[] =>
  turnedCorners(
    {
      minX: -(size.hx + pad),
      maxX: size.hx + pad,
      minY: -(size.hy + pad),
      maxY: size.hy + pad,
    },
    spot.angle,
    [spot.cx, spot.cy]
  );

/** Whether two convex polygons overlap with positive area or touch along a
 *  segment (separating axes; a segment is a two-point polygon). */
export function convexOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    const n = poly.length;
    for (let i = 0; i < (n === 2 ? 1 : n); i++) {
      const p = poly[i];
      const q = poly[(i + 1) % n];
      const ax = q[1] - p[1];
      const ay = p[0] - q[0];
      let a0 = Infinity;
      let a1 = -Infinity;
      for (const r of a) {
        const d = r[0] * ax + r[1] * ay;
        if (d < a0) a0 = d;
        if (d > a1) a1 = d;
      }
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const r of b) {
        const d = r[0] * ax + r[1] * ay;
        if (d < b0) b0 = d;
        if (d > b1) b1 = d;
      }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  // Two segments with no area are separated only along their normals,
  // tested above; a segment against a polygon also needs the polygon's.
  return true;
}

// ── Obstacles ──────────────────────────────────────────────────────────────

/**
 * What a label must not cover: the ink a mark puts down, or a placed label.
 * `owner` names the mark it came from (a label's own target is read
 * separately, as its outline only), and `scope` limits it to one `.label()`
 * call (that call's `avoiding`).
 *  - `segment`: a stretch of an outline, open or closed, as the band its
 *    stroke draws: `w` wide, centered on it (no width when it has no stroke).
 *  - `area`: the inside of a filled closed outline. A label covers it when
 *    one of its corners is inside; its boundary is filed as segments beside
 *    it.
 *  - `box`: a placed label, a convex polygon.
 */
export type Obstacle = (
  | { kind: "segment"; a: Pt; b: Pt; w?: number }
  | { kind: "area"; ring: Pt[] }
  | { kind: "box"; poly: Pt[] }
) & {
  owner: unknown;
  /** Who it is an obstacle for: everyone when undefined. */
  scope?: unknown;
};

/**
 * The ink of a segment as a convex polygon: the segment itself when it has
 * no width, and otherwise the rectangle a square-capped pen `w` wide sweeps
 * along it (a square for a single point).
 */
export function segmentInk(a: Pt, b: Pt, w = 0): Pt[] {
  if (!(w > 0)) return [a, b];
  const h = w / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] =
    len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
  // Along the segment (u) and across it (n), each h long.
  const [tx, ty] = [ux * h, uy * h];
  const [nx, ny] = [-uy * h, ux * h];
  return [
    [a[0] - tx + nx, a[1] - ty + ny],
    [b[0] + tx + nx, b[1] + ty + ny],
    [b[0] + tx - nx, b[1] + ty - ny],
    [a[0] - tx - nx, a[1] - ty - ny],
  ];
}

/** Whether a label's box (a convex polygon) covers an obstacle. */
export function covers(poly: Pt[], o: Obstacle): boolean {
  switch (o.kind) {
    case "segment":
      return convexOverlap(poly, segmentInk(o.a, o.b, o.w));
    case "box":
      return convexOverlap(poly, o.poly);
    case "area":
      return poly.some((p) => pointInRing(p, o.ring));
  }
}

/**
 * The obstacles an outline's ink stands for: its pieces
 * (`outlineSegments`), as wide as its stroke `width`, and the area inside
 * when it is closed and filled. A closed outline that is not filled is only
 * its band. `scope` limits them to one `.label()` call.
 */
export function outlineObstacles(
  o: Outline,
  owner: unknown,
  scope?: unknown
): Obstacle[] {
  const w = o.width !== undefined && o.width > 0 ? { w: o.width } : {};
  const s = scope === undefined ? {} : { scope };
  const out: Obstacle[] = outlineSegments(o).map(([a, b]) => ({
    kind: "segment",
    a,
    b,
    ...w,
    owner,
    ...s,
  }));
  if (o.closed && o.filled && o.points.length > 2)
    out.push({ kind: "area", ring: o.points, owner, ...s });
  return out;
}

/** The convex polygon of an obstacle's ink, for a segment or a box; an
 *  area has none (its ring may be concave). */
const inkOf = (o: Obstacle): Pt[] | undefined =>
  o.kind === "segment"
    ? segmentInk(o.a, o.b, o.w)
    : o.kind === "box"
      ? o.poly
      : undefined;

/** A grid cell's key: its column and row, packed into one number (rows
 *  within ±2^19 of the origin, far beyond any drawing). */
const cellKey = (i: number, j: number) => i * 1048576 + j;

/**
 * A uniform grid of obstacles: each is filed in every cell its box touches,
 * and a query visits each obstacle near a box once, in the order filed, so
 * a placement is the same every time.
 */
export class ObstacleGrid {
  private readonly cells = new Map<number, number[]>();
  /** Each obstacle with its box and, for a segment or a box, its ink. */
  private readonly items: {
    o: Obstacle;
    box: BoundingBox;
    ink: Pt[] | undefined;
  }[] = [];
  private stamp = 0;
  private readonly seen: number[] = [];

  constructor(private readonly cell: number) {}

  private range(b: BoundingBox): [number, number, number, number] {
    const c = this.cell;
    return [
      Math.floor(b.minX / c),
      Math.floor(b.minY / c),
      Math.floor(b.maxX / c),
      Math.floor(b.maxY / c),
    ];
  }

  add(o: Obstacle): void {
    const ink = inkOf(o);
    const box = ringExtent(ink ?? (o as { ring: Pt[] }).ring);
    if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite))
      return;
    const id = this.items.length;
    this.items.push({ o, box, ink });
    this.seen.push(0);
    const [i0, j0, i1, j1] = this.range(box);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = cellKey(i, j);
        const bucket = this.cells.get(k);
        if (bucket) bucket.push(id);
        else this.cells.set(k, [id]);
      }
  }

  /** Whether `poly` covers any obstacle `keep` accepts. */
  hits(poly: Pt[], keep: (o: Obstacle) => boolean): boolean {
    const box = ringExtent(poly);
    const stamp = ++this.stamp;
    const [i0, j0, i1, j1] = this.range(box);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const bucket = this.cells.get(cellKey(i, j));
        if (!bucket) continue;
        for (const id of bucket) {
          if (this.seen[id] === stamp) continue;
          this.seen[id] = stamp;
          const { o, box: ob, ink } = this.items[id];
          if (!overlaps(box, ob) || !keep(o)) continue;
          if (ink ? convexOverlap(poly, ink) : covers(poly, o)) return true;
        }
      }
    return false;
  }
}
