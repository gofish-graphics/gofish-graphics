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
 *   time (`catmullRomCubics`, or `catmullRomAt` for a single read), with the
 *   data's own time values as the knots.
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
  // Each interval's length, 0 where it is missing or has no length.
  const leftLength = j > 0 ? knots[j] - knots[j - 1] : 0;
  const rightLength = j + 1 < knots.length ? knots[j + 1] - knots[j] : 0;
  const rightSlope =
    rightLength === 0 ? 0 : (values[j + 1] - values[j]) / rightLength;
  if (leftLength === 0) return rightSlope;
  const leftSlope = (values[j] - values[j - 1]) / leftLength;
  if (rightLength === 0) return leftSlope;
  return (
    (leftSlope * rightLength + rightSlope * leftLength) /
    (leftLength + rightLength)
  );
}

/**
 * Every segment of one channel in Bézier form, flattened: segment `i` is
 * `[p_i, c₁, c₂, p_{i+1}]` at offset `4i`. The control values sit a third of
 * the interval along each end's tangent, which is what makes `u` linear in
 * the knot parameter. Each knot's tangent is worked out once and shared by
 * the two segments that meet there.
 */
export function catmullRomCubics(knots: number[], values: number[]): number[] {
  const tangents = knots.map((_, j) => tangent(knots, values, j));
  const cubics: number[] = [];
  for (let i = 0; i + 1 < knots.length; i++) {
    const h = knots[i + 1] - knots[i];
    cubics.push(
      values[i],
      values[i] + (h / 3) * tangents[i],
      values[i + 1] - (h / 3) * tangents[i + 1],
      values[i + 1]
    );
  }
  return cubics;
}

/** The cubic `[b0, b1, b2, b3]` in Bernstein form at `u`. */
function bernstein(
  b0: number,
  b1: number,
  b2: number,
  b3: number,
  u: number
): number {
  const v = 1 - u;
  return (
    v * v * v * b0 + 3 * v * v * u * b1 + 3 * v * u * u * b2 + u * u * u * b3
  );
}

/** Segment `i` of cubics from `catmullRomCubics`, at local parameter `u`. */
export function cubicAt(cubics: number[], i: number, u: number): number {
  const k = 4 * i;
  return bernstein(cubics[k], cubics[k + 1], cubics[k + 2], cubics[k + 3], u);
}

/** One channel's value at local parameter `u` of segment `i`, worked out for
 *  that one segment. A reader of many playheads should build the cubics once
 *  instead (`catmullRomCubics`). */
export function catmullRomAt(
  knots: number[],
  values: number[],
  i: number,
  u: number
): number {
  const h = knots[i + 1] - knots[i];
  return bernstein(
    values[i],
    values[i] + (h / 3) * tangent(knots, values, i),
    values[i + 1] - (h / 3) * tangent(knots, values, i + 1),
    values[i + 1],
    u
  );
}

/** One channel at local parameter `u` of segment `i`, with its first and
 *  second derivatives with respect to the knot parameter. A Catmull-Rom's
 *  velocity is continuous across a knot, but its acceleration jumps there, so
 *  the derivatives belong to one segment, and they divide by its length, so
 *  they are only meaningful on an interval longer than zero. */
export function catmullRomJet(
  knots: number[],
  values: number[],
  i: number,
  u: number
): [value: number, velocity: number, acceleration: number] {
  const h = knots[i + 1] - knots[i];
  const b0 = values[i];
  const b1 = values[i] + (h / 3) * tangent(knots, values, i);
  const b2 = values[i + 1] - (h / 3) * tangent(knots, values, i + 1);
  const b3 = values[i + 1];
  const v = 1 - u;
  return [
    bernstein(b0, b1, b2, b3, u),
    (3 * (v * v * (b1 - b0) + 2 * v * u * (b2 - b1) + u * u * (b3 - b2))) / h,
    (6 * (v * (b2 - 2 * b1 + b0) + u * (b3 - 2 * b2 + b1))) / (h * h),
  ];
}

/** Thread a run of points with one cubic per knot interval: each coordinate
 *  is a channel of the same spline. Fewer than two points thread nothing. */
export function catmullRomPath(
  points: Point[],
  knots: number[]
): BezierCurve[] {
  const xs = catmullRomCubics(
    knots,
    points.map((p) => p[0])
  );
  const ys = catmullRomCubics(
    knots,
    points.map((p) => p[1])
  );
  const out: BezierCurve[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const k = 4 * i;
    out.push(
      curve(
        points[i],
        [xs[k + 1], ys[k + 1]],
        [xs[k + 2], ys[k + 2]],
        points[i + 1]
      )
    );
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
