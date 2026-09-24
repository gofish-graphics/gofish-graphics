/**
 * The one Catmull-Rom spline, used by everything that reads or draws one.
 *
 * A Catmull-Rom spline threads a run of values with one cubic per interval
 * between neighboring knots. Each cubic passes through the values at its two
 * ends, and its velocity at a knot is the Barry-Goldman tangent (see
 * `tangent`), so the curve is smooth through every knot. Only the knots
 * differ between the callers:
 *
 * - `time.transition()` and `interpolate()` read one channel at the clock's
 *   time (`catmullRomAt`), with the data's own time values as the knots.
 * - `line` and `ribbon` thread their points as a path (`catmullRomPath`), and
 *   so does adaptive resampling when it smooths the points it sampled. Their
 *   knots are centripetal (`centripetalKnots`), because a run of placed
 *   points carries no parameter of its own.
 *
 * Segment `i` runs from knot `i` to knot `i + 1`, and its local parameter `u`
 * is linear in the knot parameter: `u = (t − t_i) / (t_{i+1} − t_i)`. So a
 * path's cubic at `u` is the point a reading at the matching `t` gives, which
 * is what lets a threaded line be cut by time (`windowPath` in
 * `timeWindow.ts`).
 *
 * Knots must be ascending and as many as the values. Two equal knots make an
 * interval of zero length, which `tangent` reads as a place the run ends.
 */

import { type BezierCurve, type Point, curve } from "./path";

/**
 * The velocity at knot `j`, per unit of the knot parameter: the Barry-Goldman
 * tangent, which is the slope at `t_j` of the parabola through the knots
 * `j − 1`, `j` and `j + 1`. It averages the slopes of the two intervals that
 * meet at the knot, each weighted by the length of the OTHER interval, so the
 * shorter interval, whose neighbor is nearer, counts for more:
 *
 *   m_j = (s_left · Δ_right + s_right · Δ_left) / (Δ_left + Δ_right)
 *
 * At an end of the run one interval is missing. It is replaced by the end
 * interval reflected outward, a point at `2p₀ − p₁` with knot `2t₀ − t₁`,
 * whose slope is the end interval's own, so the tangent at an end is just
 * that slope. A run that changes at a constant rate keeps that rate through
 * its ends, and a run of two values is a straight line. An interval of zero
 * length (two values at one knot) has no slope and is read the same way, as
 * a place the run ends.
 */
function tangent(knots: number[], values: number[], j: number): number {
  const interval = (a: number) =>
    a < 0 || a + 1 >= knots.length || knots[a + 1] === knots[a]
      ? undefined
      : {
          slope: (values[a + 1] - values[a]) / (knots[a + 1] - knots[a]),
          length: knots[a + 1] - knots[a],
        };
  const left = interval(j - 1);
  const right = interval(j);
  if (left === undefined) return right?.slope ?? 0;
  if (right === undefined) return left.slope;
  return (
    (left.slope * right.length + right.slope * left.length) /
    (left.length + right.length)
  );
}

/** Segment `i` of one channel in Bézier form: the values at its two ends and
 *  the two control values between them, `[p_i, c₁, c₂, p_{i+1}]`. The
 *  control values sit a third of the interval along each end's tangent,
 *  which is what makes `u` linear in the knot parameter. */
export function catmullRomSegment(
  knots: number[],
  values: number[],
  i: number
): [number, number, number, number] {
  const h = knots[i + 1] - knots[i];
  return [
    values[i],
    values[i] + (h / 3) * tangent(knots, values, i),
    values[i + 1] - (h / 3) * tangent(knots, values, i + 1),
    values[i + 1],
  ];
}

/** A value and its first two derivatives with respect to the knot parameter.
 *  A Catmull-Rom's velocity is continuous across a knot, but its
 *  acceleration jumps there, so a jet belongs to one segment. */
export type Jet = [value: number, velocity: number, acceleration: number];

/** One channel at local parameter `u` of segment `i`, with its velocity and
 *  acceleration. The derivatives divide by the interval's length, so they
 *  are only meaningful on an interval longer than zero. */
export function catmullRomJet(
  knots: number[],
  values: number[],
  i: number,
  u: number
): Jet {
  const [b0, b1, b2, b3] = catmullRomSegment(knots, values, i);
  const h = knots[i + 1] - knots[i];
  const v = 1 - u;
  return [
    v * v * v * b0 + 3 * v * v * u * b1 + 3 * v * u * u * b2 + u * u * u * b3,
    (3 * (v * v * (b1 - b0) + 2 * v * u * (b2 - b1) + u * u * (b3 - b2))) / h,
    (6 * (v * (b2 - 2 * b1 + b0) + u * (b3 - 2 * b2 + b1))) / (h * h),
  ];
}

/** One channel's value at local parameter `u` of segment `i`. */
export function catmullRomAt(
  knots: number[],
  values: number[],
  i: number,
  u: number
): number {
  return catmullRomJet(knots, values, i, u)[0];
}

/** Thread a run of points with one cubic per knot interval: each coordinate
 *  is a channel of the same spline. Fewer than two points thread nothing. */
export function catmullRomPath(
  points: Point[],
  knots: number[]
): BezierCurve[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const out: BezierCurve[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [, x1, x2] = catmullRomSegment(knots, xs, i);
    const [, y1, y2] = catmullRomSegment(knots, ys, i);
    out.push(curve(points[i], [x1, y1], [x2, y2], points[i + 1]));
  }
  return out;
}

/** Centripetal knots, for a run of points with no parameter of its own: each
 *  interval is as long as the square root of the distance between its two
 *  points. This is the parameterization that keeps a segment from forming a
 *  cusp or a loop (Yuksel, Schaefer and Keyser, 2011), and the one d3's
 *  `curveCatmullRom` uses by default. */
export function centripetalKnots(points: Point[]): number[] {
  const knots = points.length === 0 ? [] : [0];
  for (let i = 1; i < points.length; i++) {
    const distance = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1]
    );
    knots.push(knots[i - 1] + Math.sqrt(distance));
  }
  return knots;
}
