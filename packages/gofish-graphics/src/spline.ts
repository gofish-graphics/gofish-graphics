/**
 * The smooth curves: the monotone cubic, used by everything that reads or
 * draws a run of values over a parameter, and the centripetal Catmull-Rom, a
 * screen-space path curve only.
 *
 * Both are cubic Hermite splines: one cubic per interval between neighboring
 * knots, passing through the values at its two ends, with a velocity at each
 * knot shared by the two cubics that meet there, so the curve is smooth
 * through every knot. They differ only in that velocity (the knot's slope):
 *
 * - The monotone cubic (`monotoneSlopes`) is Steffen's (1990), the curve d3's
 *   `curveMonotoneX` and Vega-Lite's `interpolate: "monotone"` draw. It is
 *   monotone PIECEWISE: between two knots each channel only rises or only
 *   falls, so it never goes past either neighbor. The run as a whole still
 *   turns wherever the data turns, and the turn sits exactly on the knot.
 *   `time.transition()` and `interpolate()` read one channel at the clock's
 *   time (`monotoneCubics`, or `monotoneAt` for a single read), with the
 *   data's own time values as the knots; `line` and `ribbon` thread their
 *   points with it (`monotonePath`), with the data's own parameter as the
 *   knots when the run has one.
 * - The Catmull-Rom (`catmullRomPath`) threads a run of points on screen with
 *   centripetal knots (`centripetalKnots`), as d3's `curveCatmullRom` does. It
 *   is a shape in screen space, not a reading of values over a parameter, so
 *   it takes no knots of its own and nothing reads it over time. It can
 *   overshoot the points between them.
 *
 * Segment `i` runs from knot `i` to knot `i + 1`, and its local parameter `u`
 * is linear in the knot parameter: `u = (t − t_i) / (t_{i+1} − t_i)`. So a
 * path's cubic at `u` is the point a reading at the matching `t` gives, which
 * is what lets a threaded line be cut by time (`windowPath` in
 * `timeWindow.ts`).
 */

import { type BezierCurve, type Point, curve } from "./path";

/** d3's sign: 0 counts as positive, so a flat interval next to a rising one
 *  does not cancel it (the min in `monotoneSlopes` makes the slope 0 anyway). */
const sign = (x: number): number => (x < 0 ? -1 : 1);

/**
 * The monotone cubic's velocity at every knot, per unit of the knot
 * parameter: Steffen's slopes (d3's `slope3`), with zero-curvature ends (d3's
 * `slope2`, Steffen eq. 28–29).
 *
 * With `h_i` the length of interval `i` and `s_i` its slope, an interior knot
 * takes the slope of the parabola through it and its two neighbors,
 * `p_i = (s_{i−1} h_i + s_i h_{i−1}) / (h_{i−1} + h_i)`, limited so the
 * cubics on either side stay monotone:
 *
 *   m_i = (sign s_{i−1} + sign s_i) · min(|s_{i−1}|, |s_i|, |p_i| / 2)
 *
 * which is 0 where the run turns (the two slopes differ in sign), so a peak
 * sits on its knot. An end takes the slope that gives its cubic no curvature
 * there, `m_0 = (3 s_0 − m_1) / 2`, and a run of two values is a straight
 * line.
 *
 * The arithmetic is d3's, degenerate intervals included, so the curve is
 * d3's `curveMonotoneX` exactly. A knot and value that repeat the previous
 * pair are one point, as d3 ignores a coincident point: the slopes are
 * worked out without it, it takes the slope of the point it repeats, and its
 * segment is that point. An interval of zero length between two different
 * values is a jump: its slope is infinite, which the minimum above keeps out
 * of the neighboring slopes, and its segment's control values sit on its two
 * ends. The knots are otherwise expected in ascending order.
 */
export function monotoneSlopes(knots: number[], values: number[]): number[] {
  // The points d3 keeps: each one that does not repeat the last one kept.
  const kept: number[] = [];
  const keptAt: number[] = [];
  for (let i = 0; i < knots.length; i++) {
    const last = kept[kept.length - 1];
    if (
      last !== undefined &&
      knots[i] === knots[last] &&
      values[i] === values[last]
    ) {
      keptAt.push(kept.length - 1);
      continue;
    }
    keptAt.push(kept.length);
    kept.push(i);
  }
  const m = d3Slopes(
    kept.map((i) => knots[i]),
    kept.map((i) => values[i])
  );
  return keptAt.map((k) => m[k]);
}

/** d3's `curveMonotoneX` slopes over points with no coincident neighbors:
 *  `slope3` inside, `slope2` at the ends, and a straight line for two. */
function d3Slopes(t: number[], v: number[]): number[] {
  const n = t.length;
  if (n < 2) return n === 1 ? [0] : [];
  if (n === 2) {
    const h = t[1] - t[0];
    const s = h ? (v[1] - v[0]) / h : 0;
    return [s, s];
  }
  const m: number[] = new Array(n);
  for (let i = 1; i + 1 < n; i++) {
    const h0 = t[i] - t[i - 1];
    const h1 = t[i + 1] - t[i];
    const s0 = (v[i] - v[i - 1]) / (h0 || (h1 < 0 ? -0 : 0));
    const s1 = (v[i + 1] - v[i]) / (h1 || (h0 < 0 ? -0 : 0));
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    m[i] =
      (sign(s0) + sign(s1)) *
        Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const slope2 = (i: number, tangent: number) => {
    const h = t[i + 1] - t[i];
    return h ? ((3 * (v[i + 1] - v[i])) / h - tangent) / 2 : tangent;
  };
  m[0] = slope2(0, m[1]);
  m[n - 1] = slope2(n - 2, m[n - 2]);
  return m;
}

/**
 * The Catmull-Rom's velocity at every knot: the Barry-Goldman tangent, the
 * slope at `t_j` of the parabola through knots `j − 1`, `j` and `j + 1`. At an
 * end the interval beyond is the end interval reflected outward, so the
 * tangent there is the end interval's own slope. An interval of zero length
 * (two points at one spot, which centripetal knots make) has no slope and is
 * read as a place the run ends, so the path stays finite.
 */
function catmullRomSlopes(knots: number[], values: number[]): number[] {
  return knots.map((_, j) => {
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
  });
}

/**
 * Every segment of one channel in Bézier form, flattened: segment `i` is
 * `[v_i, c₁, c₂, v_{i+1}]` at offset `4i`. The control values sit a third of
 * the interval along each end's slope, `c₁ = v_i + h_i m_i / 3` and
 * `c₂ = v_{i+1} − h_i m_{i+1} / 3`, which is what makes `u` linear in the
 * knot parameter.
 */
function hermiteCubics(
  knots: number[],
  values: number[],
  slopes: number[]
): number[] {
  const cubics: number[] = [];
  for (let i = 0; i + 1 < knots.length; i++) {
    const h = knots[i + 1] - knots[i];
    cubics.push(
      values[i],
      values[i] + (h / 3) * slopes[i],
      values[i + 1] - (h / 3) * slopes[i + 1],
      values[i + 1]
    );
  }
  return cubics;
}

/** Thread a run of points with one cubic per knot interval: each coordinate
 *  is a channel of the same spline. Fewer than two points thread nothing. */
function hermitePath(
  points: Point[],
  knots: number[],
  slopes: (knots: number[], values: number[]) => number[]
): BezierCurve[] {
  const channel = (c: 0 | 1) => {
    const values = points.map((p) => p[c]);
    return hermiteCubics(knots, values, slopes(knots, values));
  };
  const xs = channel(0);
  const ys = channel(1);
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

/** One channel's monotone cubics, in the flattened Bézier form `cubicAt`
 *  reads. */
export function monotoneCubics(knots: number[], values: number[]): number[] {
  return hermiteCubics(knots, values, monotoneSlopes(knots, values));
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

/** Segment `i` of cubics from `monotoneCubics`, at local parameter `u`. */
export function cubicAt(cubics: number[], i: number, u: number): number {
  const k = 4 * i;
  return bernstein(cubics[k], cubics[k + 1], cubics[k + 2], cubics[k + 3], u);
}

/** One channel's value at local parameter `u` of segment `i`. A reader of
 *  many playheads should build the cubics once instead (`monotoneCubics`). */
export function monotoneAt(
  knots: number[],
  values: number[],
  i: number,
  u: number
): number {
  return cubicAt(monotoneCubics(knots, values), i, u);
}

/** One channel at local parameter `u` of segment `i`, with its first and
 *  second derivatives with respect to the knot parameter. The velocity is
 *  continuous across a knot, but the acceleration jumps there, so the
 *  derivatives belong to one segment. They divide by its length, so they are
 *  only meaningful on a segment longer than zero; a zero-length one is a
 *  point or a jump, with no rate. */
export function monotoneJet(
  knots: number[],
  values: number[],
  i: number,
  u: number
): [value: number, velocity: number, acceleration: number] {
  const cubics = monotoneCubics(knots, values);
  const k = 4 * i;
  const [b0, b1, b2, b3] = cubics.slice(k, k + 4);
  const h = knots[i + 1] - knots[i];
  const v = 1 - u;
  return [
    bernstein(b0, b1, b2, b3, u),
    (3 * (v * v * (b1 - b0) + 2 * v * u * (b2 - b1) + u * u * (b3 - b2))) / h,
    (6 * (v * (b2 - 2 * b1 + b0) + u * (b3 - 2 * b2 + b1))) / (h * h),
  ];
}

/** Thread a run of points with the monotone cubic over `knots`: each
 *  coordinate is monotone between neighboring points. */
export function monotonePath(points: Point[], knots: number[]): BezierCurve[] {
  return hermitePath(points, knots, monotoneSlopes);
}

/** Thread a run of points on screen with a centripetal Catmull-Rom. */
export function catmullRomPath(points: Point[]): BezierCurve[] {
  return hermitePath(points, centripetalKnots(points), catmullRomSlopes);
}

/** Centripetal knots, for a run of points with no parameter of its own: each
 *  interval is as long as the square root of the distance between its two
 *  points. This is the parameterization that keeps a Catmull-Rom segment from
 *  forming a cusp or a loop (Yuksel, Schaefer and Keyser, 2011), and the one
 *  d3's `curveCatmullRom` uses by default. It depends on where the points sit
 *  on screen. */
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
