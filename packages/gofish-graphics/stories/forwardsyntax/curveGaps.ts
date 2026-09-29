/**
 * Where two neighboring curves of the ladder part company, in pixels: the
 * numbers behind the rings the animated Curve Ladder draws.
 *
 * A curve here is the path a `line` draws through a run of points, read over
 * the run's own parameter (the year): each coordinate is one channel of the
 * library's data-space curve (`channelSpline`). `step` and `linear` draw
 * straight segments between the points; on a connected scatter plot `step`
 * holds both coordinates and jumps diagonally, so its drawn path is the
 * linear one (it differs only in where the time is spent).
 */
import { channelSpline } from "../../src/spline";

export type LadderCurve = "step" | "linear" | "monotone" | "smooth" | "smoother";

/** A point of a sampled path: its year and its position. */
export type PathPoint = { t: number; x: number; y: number };

/** The path `curve` draws through `(xs[i], ys[i])` at years `knots[i]`,
 *  sampled `perInterval` times in each year interval. */
export function samplePath(
  curve: LadderCurve,
  knots: number[],
  xs: number[],
  ys: number[],
  perInterval = 40
): PathPoint[] {
  const straight = curve === "step" || curve === "linear";
  const cx = straight ? undefined : channelSpline(curve, knots, xs);
  const cy = straight ? undefined : channelSpline(curve, knots, ys);
  const out: PathPoint[] = [{ t: knots[0], x: xs[0], y: ys[0] }];
  for (let i = 0; i + 1 < knots.length; i++) {
    for (let s = 1; s <= perInterval; s++) {
      const u = s / perInterval;
      out.push({
        t: knots[i] + u * (knots[i + 1] - knots[i]),
        x: cx ? cx.at(i, u) : xs[i] + u * (xs[i + 1] - xs[i]),
        y: cy ? cy.at(i, u) : ys[i] + u * (ys[i + 1] - ys[i]),
      });
    }
  }
  return out;
}

/** A linear map from data to pixels: the data extents onto a plot of the
 *  given size, with y growing upward in data and downward on screen. */
export type PixelMap = {
  x: [number, number];
  y: [number, number];
  w: number;
  h: number;
};

export const toPixels = (m: PixelMap, p: PathPoint): PathPoint => ({
  t: p.t,
  x: ((p.x - m.x[0]) / (m.x[1] - m.x[0])) * m.w,
  y: ((m.y[1] - p.y) / (m.y[1] - m.y[0])) * m.h,
});

/** The distance from `p` to the nearest point of the polyline `path`. */
function distanceToPath(p: PathPoint, path: PathPoint[]): number {
  let best = Infinity;
  for (let j = 0; j + 1 < path.length; j++) {
    const a = path[j];
    const b = path[j + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)));
  }
  return best;
}

/** One place two paths part company: the year interval it is in, the gap in
 *  pixels, and the point on the first path where it is largest. */
export type Gap = { from: number; to: number; px: number; at: PathPoint };

/**
 * The largest gaps between two paths (in pixels), at most `count` of them,
 * from distinct places: the largest gap in each year interval, measured both
 * ways (each path's samples to the nearest point of the other), then the
 * largest of those whose points are at least `apart` pixels from one already
 * taken. The gap is placed on `a`'s sample, or on the nearest `a` sample when
 * it was measured from `b`.
 */
export function largestGaps(
  a: PathPoint[],
  b: PathPoint[],
  knots: number[],
  count = 3,
  apart = 60,
  minPx = 0.5
): Gap[] {
  const interval = (t: number) => {
    let i = 0;
    while (i < knots.length - 2 && knots[i + 1] <= t) i++;
    return i;
  };
  const best = new Map<number, Gap>();
  const consider = (p: PathPoint, other: PathPoint[], place: PathPoint) => {
    const px = distanceToPath(p, other);
    const i = interval(p.t);
    const gap = best.get(i);
    if (gap === undefined || px > gap.px) {
      best.set(i, { from: knots[i], to: knots[i + 1], px, at: place });
    }
  };
  const nearestOnA = (p: PathPoint) =>
    a.reduce((m, q) =>
      Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? q : m
    );
  for (const p of a) consider(p, b, p);
  for (const p of b) consider(p, a, nearestOnA(p));
  const taken: Gap[] = [];
  for (const gap of [...best.values()].sort((g, h) => h.px - g.px)) {
    if (taken.length >= count || gap.px < minPx) break;
    const far = taken.every(
      (g) => Math.hypot(g.at.x - gap.at.x, g.at.y - gap.at.y) >= apart
    );
    if (far) taken.push(gap);
  }
  return taken;
}
