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

/** Twice the signed area of a ring; positive when it runs clockwise on a
 *  y-down screen. */
export function signedArea2(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/** Whether `p` is inside a ring (even-odd). */
export function pointInRing(p: Pt, ring: Pt[]): boolean {
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

// ── A label's box ──────────────────────────────────────────────────────────

/** The corners of a label's box at a spot, grown by `pad` on every side. */
export function corners(spot: Spot, size: HalfSize, pad = 0): Pt[] {
  const hx = size.hx + pad;
  const hy = size.hy + pad;
  const local: Pt[] = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ];
  if (!spot.angle) return local.map(([x, y]) => [spot.cx + x, spot.cy + y]);
  const a = (spot.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return local.map(([x, y]) => [
    spot.cx + x * c - y * s,
    spot.cy + x * s + y * c,
  ]);
}

export type Aabb = { x0: number; y0: number; x1: number; y1: number };

export function aabbOf(points: Pt[]): Aabb {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const aabbsMeet = (a: Aabb, b: Aabb): boolean =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

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
 * The obstacles an outline's ink stands for: its segments, as wide as its
 * stroke `width`, and the area inside when it is closed and `filled`. A
 * closed outline that is not filled is only its band. `filled` is false for
 * a label's own mark, which it may sit inside.
 */
export function outlineObstacles(
  points: Pt[],
  closed: boolean,
  owner: unknown,
  filled: boolean,
  width?: number
): Obstacle[] {
  const out: Obstacle[] = [];
  const n = points.length;
  const w = width !== undefined && width > 0 ? { w: width } : {};
  for (let i = 0; i + 1 < n; i++)
    out.push({ kind: "segment", a: points[i], b: points[i + 1], ...w, owner });
  if (closed && n > 2) {
    out.push({ kind: "segment", a: points[n - 1], b: points[0], ...w, owner });
    if (filled) out.push({ kind: "area", ring: points, owner });
  }
  if (n === 1)
    out.push({ kind: "segment", a: points[0], b: points[0], ...w, owner });
  return out;
}

const obstacleAabb = (o: Obstacle): Aabb =>
  o.kind === "segment"
    ? aabbOf(segmentInk(o.a, o.b, o.w))
    : aabbOf(o.kind === "area" ? o.ring : o.poly);

/**
 * A uniform grid of obstacles: each is filed in every cell its box touches,
 * and a query visits each obstacle near a box once, in the order filed, so
 * a placement is the same every time.
 */
export class ObstacleGrid {
  private readonly cells = new Map<string, number[]>();
  private readonly items: { o: Obstacle; box: Aabb }[] = [];
  private stamp = 0;
  private readonly seen: number[] = [];

  constructor(private readonly cell: number) {}

  private range(b: Aabb): [number, number, number, number] {
    const c = this.cell;
    return [
      Math.floor(b.x0 / c),
      Math.floor(b.y0 / c),
      Math.floor(b.x1 / c),
      Math.floor(b.y1 / c),
    ];
  }

  add(o: Obstacle): void {
    const box = obstacleAabb(o);
    if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return;
    const id = this.items.length;
    this.items.push({ o, box });
    this.seen.push(0);
    const [i0, j0, i1, j1] = this.range(box);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        const bucket = this.cells.get(k);
        if (bucket) bucket.push(id);
        else this.cells.set(k, [id]);
      }
  }

  /** Whether `poly` covers any obstacle `keep` accepts. */
  hits(poly: Pt[], keep: (o: Obstacle) => boolean): boolean {
    const box = aabbOf(poly);
    const stamp = ++this.stamp;
    const [i0, j0, i1, j1] = this.range(box);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const bucket = this.cells.get(`${i},${j}`);
        if (!bucket) continue;
        for (const id of bucket) {
          if (this.seen[id] === stamp) continue;
          this.seen[id] = stamp;
          const { o, box: ob } = this.items[id];
          if (!aabbsMeet(box, ob) || !keep(o)) continue;
          if (covers(poly, o)) return true;
        }
      }
    return false;
  }
}
