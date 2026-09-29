/**
 * The smooth curves: the three data-space curves (`monotone`, `smooth` and
 * `smoother`), used by everything that reads or draws a run of values over a
 * parameter, and the centripetal Catmull-Rom, a screen-space path curve only.
 *
 * The data-space curves read one channel of a run at a time, over knots at
 * the data's own parameter values. Each passes through every value. From
 * the least to the most smooth:
 *
 * - `monotone` (`monotoneSlopes`) is Steffen's (1990) cubic, the curve d3's
 *   `curveMonotoneX` and Vega-Lite's `interpolate: "monotone"` draw. It is
 *   monotone PIECEWISE: between two knots each channel only rises or only
 *   falls, so it never goes past either neighbor. The run as a whole still
 *   turns wherever the data turns, and the turn sits exactly on the knot.
 * - `smooth` (`smoothSlopes`) is the modified Akima cubic ("makima", Moler
 *   2019), the one MATLAB's `makima` and SciPy's
 *   `Akima1DInterpolator(method="makima")` draw. A peak can round past its
 *   knot, but a run of three or more equal values stays exactly flat.
 * - `smoother` (`smootherJet`) is Yuksel's (2020) C2 interpolating curve,
 *   applied to one channel over its knots (the paper works on curves in the
 *   plane; the one-channel reading is ours). Its acceleration is continuous
 *   through every knot, so it has no visible corners in its curvature. Next
 *   to a jump it can dip a little past its knots.
 *
 * `monotone` and `smooth` are cubic Hermite splines: one cubic per interval
 * between neighboring knots, passing through the values at its two ends, with
 * a velocity at each knot shared by the two cubics that meet there. They
 * differ only in that velocity (the knot's slope). `smoother` is not a
 * cubic: it blends two parabolas with trigonometric weights, so it is drawn
 * with several cubics per interval (`SMOOTHER_PIECES`).
 *
 * `time.transition()` and `interpolate()` read one channel at the clock's
 * time (`channelSpline`), with the data's own time values as the knots;
 * `line` and `ribbon` thread their points with it (`threadPath`), with the
 * data's own parameter as the knots when the run has one.
 *
 * The Catmull-Rom (`catmullRomPath`) threads a run of points on screen with
 * centripetal knots (`centripetalKnots`), as d3's `curveCatmullRom` does. It
 * is a shape in screen space, not a reading of values over a parameter, so it
 * takes no knots of its own and nothing reads it over time. It can overshoot
 * the points between them.
 *
 * Segment `i` runs from knot `i` to knot `i + 1`, and its local parameter `u`
 * is linear in the knot parameter: `u = (t − t_i) / (t_{i+1} − t_i)`. When a
 * segment is drawn with several cubics, each covers an equal share of `u`,
 * and its own parameter is linear in `u` too. So a path's cubic at `u` is the
 * point a reading at the matching `t` gives, which is what lets a threaded
 * line be cut by time (`windowPath` in `timeWindow.ts`).
 */

import { type BezierCurve, type Point, curve, samePoint } from "./path";

/** Throw unless the knots are strictly ascending: every data-space curve
 *  divides by the length of each interval. A NaN knot is not caught here. */
function assertAscending(t: number[], where: string): void {
  for (let i = 1; i < t.length; i++) {
    if (t[i] - t[i - 1] <= 0) {
      throw new Error(
        `[gofish] ${where}: the knots must be strictly ascending, but ` +
          `knot ${i} (${t[i]}) does not come after knot ${i - 1} (${t[i - 1]}).`
      );
    }
  }
}

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
 * The arithmetic is d3's, so the curve is d3's `curveMonotoneX` exactly. The
 * knots must be strictly ascending: this throws on an interval of zero or
 * negative length. A NaN knot is not checked and makes its slopes NaN. A point
 * that repeats the one before it is dropped before this is called
 * (`threadPath`), as d3 drops it.
 *
 * The curve is unchanged by an affine change of the knots (scaling them by `a`
 * scales every slope by `1/a`) and commutes with an affine map of each channel
 * on its own, negation included: scaling a channel scales its slopes, and the
 * limits on a slope (the signs of its neighbors and a minimum of absolute
 * values) treat a negated slope as they treat the original. It does not
 * commute with a map that mixes the channels, such as a rotation.
 */
export function monotoneSlopes(t: number[], v: number[]): number[] {
  assertAscending(t, "monotoneSlopes");
  const n = t.length;
  if (n < 2) return n === 1 ? [0] : [];
  if (n === 2) {
    const s = (v[1] - v[0]) / (t[1] - t[0]);
    return [s, s];
  }
  const m: number[] = new Array(n);
  for (let i = 1; i + 1 < n; i++) {
    const h0 = t[i] - t[i - 1];
    const h1 = t[i + 1] - t[i];
    const s0 = (v[i] - v[i - 1]) / h0;
    const s1 = (v[i + 1] - v[i]) / h1;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    m[i] =
      (sign(s0) + sign(s1)) *
        Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const slope2 = (i: number, tangent: number) =>
    ((3 * (v[i + 1] - v[i])) / (t[i + 1] - t[i]) - tangent) / 2;
  m[0] = slope2(0, m[1]);
  m[n - 1] = slope2(n - 2, m[n - 2]);
  return m;
}

/**
 * The `smooth` cubic's velocity at every knot: the modified Akima slopes
 * ("makima", Moler 2019), computed as SciPy's
 * `Akima1DInterpolator(method="makima")` computes them.
 *
 * Each knot's slope is a weighted mean of the slopes of the two intervals
 * that meet there, `s_{i−1}` and `s_i`. The weight on each side's slope
 * grows with how much the slopes on the other side change, so the knot's
 * slope leans toward the side where the run is steadier:
 *
 *   w₁ = |s_{i+1} − s_i| + |s_{i+1} + s_i| / 2
 *   w₂ = |s_{i−1} − s_{i−2}| + |s_{i−1} + s_{i−2}| / 2
 *   m_i = (w₁ s_{i−1} + w₂ s_i) / (w₁ + w₂)
 *
 * Near an end the missing interval slopes are extended in a straight line,
 * two past each end: `s_{−1} = 2 s_0 − s_1`, `s_{−2} = 2 s_{−1} − s_0`, and
 * the same at the far end. When `w₁ + w₂` is 0 up to rounding (at most 1e-9
 * of its largest value over the run, SciPy's cutoff), the slope is the mean
 * `(s_{i−2} + s_{i+1}) / 2`, which is 0 because the weights only vanish when
 * all four slopes are 0.
 *
 * A knot next to a flat interval has slope 0 when the interval on its other
 * side, or the interval beyond the flat one, is flat too. So a run of three
 * or more equal values stays exactly flat, while a lone flat interval between
 * two changes can bow a little. A run of two values is a straight line. Each slope
 * depends only on the values of the five knots around it, so the curve is
 * local. The knots must be strictly ascending, as for `monotoneSlopes`.
 */
export function smoothSlopes(t: number[], v: number[]): number[] {
  assertAscending(t, "smoothSlopes");
  const n = t.length;
  if (n < 2) return n === 1 ? [0] : [];
  // The interval slopes at offset 2, with the two extended ones on each side.
  const s: number[] = new Array(n + 3);
  for (let i = 0; i + 1 < n; i++) {
    s[i + 2] = (v[i + 1] - v[i]) / (t[i + 1] - t[i]);
  }
  if (n === 2) return [s[2], s[2]];
  s[1] = 2 * s[2] - s[3];
  s[0] = 2 * s[1] - s[2];
  s[n + 1] = 2 * s[n] - s[n - 1];
  s[n + 2] = 2 * s[n + 1] - s[n];
  // Knot i's four neighboring slopes are s[i] .. s[i + 3].
  const w1: number[] = new Array(n);
  const w2: number[] = new Array(n);
  let largest = 0;
  for (let i = 0; i < n; i++) {
    w1[i] = Math.abs(s[i + 3] - s[i + 2]) + Math.abs(s[i + 3] + s[i + 2]) / 2;
    w2[i] = Math.abs(s[i + 1] - s[i]) + Math.abs(s[i + 1] + s[i]) / 2;
    largest = Math.max(largest, w1[i] + w2[i]);
  }
  return w1.map((_, i) => {
    const total = w1[i] + w2[i];
    return total > 1e-9 * largest
      ? (w1[i] * s[i + 1] + w2[i] * s[i + 2]) / total
      : (s[i] + s[i + 3]) / 2;
  });
}

/**
 * The `smoother` curve on one channel, at local parameter `u` of segment `i`:
 * its value and its velocity per unit of the knot parameter.
 *
 * This is Yuksel's "A Class of C2 Interpolating Curves" (2020) with
 * parabolas as the interpolating functions, applied to a channel over its
 * knots. `P_j` is the parabola through knots `j − 1`, `j` and `j + 1`, at
 * their real (possibly uneven) positions. Segment `i` blends the two
 * parabolas that pass through both of its ends:
 *
 *   θ = (π / 2) u,   C = cos²θ · P_i + sin²θ · P_{i+1}
 *
 * The weights have no slope at either end of the segment, so the value, the
 * velocity and the acceleration at knot `i` are all `P_i`'s, whichever
 * segment reads them: the curve is C2 (its acceleration is continuous). A
 * segment depends on four knots, so the curve is local. An end segment has
 * only one parabola through both of its ends and is that parabola; a run of
 * two values is a straight line. The curve is not a polynomial, so it is
 * drawn with several cubics per segment (`SMOOTHER_PIECES`).
 */
export function smootherJet(
  t: number[],
  v: number[],
  i: number,
  u: number
): [value: number, velocity: number] {
  const n = t.length;
  const h = t[i + 1] - t[i];
  if (n === 2) return [v[0] + u * (v[1] - v[0]), (v[1] - v[0]) / h];
  // At u = 1 the knot itself, which `t_i + h` can miss by rounding.
  const x = u === 1 ? t[i + 1] : t[i] + u * h;
  /** The parabola through knots j − 1, j and j + 1, and its slope, at x. */
  const parabola = (j: number): [number, number] => {
    const a = t[j - 1];
    const b = t[j];
    const c = t[j + 1];
    const la = v[j - 1] / ((a - b) * (a - c));
    const lb = v[j] / ((b - a) * (b - c));
    const lc = v[j + 1] / ((c - a) * (c - b));
    return [
      la * (x - b) * (x - c) + lb * (x - a) * (x - c) + lc * (x - a) * (x - b),
      la * (2 * x - b - c) + lb * (2 * x - a - c) + lc * (2 * x - a - b),
    ];
  };
  if (i === 0) return parabola(1);
  if (i === n - 2) return parabola(n - 2);
  const [left, leftSlope] = parabola(i);
  const [right, rightSlope] = parabola(i + 1);
  const w = Math.cos((Math.PI / 2) * u) ** 2;
  const wSlope = (-(Math.PI / 2) * Math.sin(Math.PI * u)) / h;
  return [
    w * left + (1 - w) * right,
    w * leftSlope + (1 - w) * rightSlope + wSlope * (left - right),
  ];
}

/**
 * How many cubics draw one interior segment of `smoother`. Each cubic covers
 * an equal share of the segment and matches the curve's value and velocity
 * at both of its ends.
 *
 * The error is known in closed form. On an interior segment the curve is
 * `P_{i+1} + cos²θ · (P_i − P_{i+1})`, and `P_i − P_{i+1}` is a parabola that
 * is 0 at both ends of the segment, so the part a cubic cannot follow is a
 * fixed shape scaled by the gap `D` between the two parabolas at the middle
 * of the segment. With 12 cubics the largest error, measured densely on that
 * shape, is 3.9e-5 · |D|: 0.04px when the two parabolas are 1000px apart. An
 * end segment is a parabola, which one cubic draws exactly.
 */
export const SMOOTHER_PIECES = 12;

/** The data-space smooth curves, from the least to the most smooth. */
export type SmoothCurve = "monotone" | "smooth" | "smoother";

/** The data-space smooth curves, in the order of `SmoothCurve`. */
export const SMOOTH_CURVES: readonly SmoothCurve[] = [
  "monotone",
  "smooth",
  "smoother",
];

/**
 * One channel of a run, read over its knots with a smooth curve and prepared
 * once, for reading at many places and for drawing.
 */
export type ChannelSpline = {
  /** The value at local parameter `u` of segment `i`. */
  at: (i: number, u: number) => number;
  /** Segment `i` in Bézier form, flattened: one or more cubics
   *  `[b0, b1, b2, b3]` in order, each covering an equal share of `u`, with
   *  its own parameter linear in `u`. */
  bezier: (i: number) => number[];
};

/** One channel of a run read with `curve` over `knots` (strictly
 *  ascending). */
export function channelSpline(
  curve: SmoothCurve,
  knots: number[],
  values: number[]
): ChannelSpline {
  if (curve !== "smoother") {
    const slopes = curve === "monotone" ? monotoneSlopes : smoothSlopes;
    const cubics = hermiteCubics(knots, values, slopes(knots, values));
    return {
      at: (i, u) => cubicAt(cubics, i, u),
      bezier: (i) => cubics.slice(4 * i, 4 * i + 4),
    };
  }
  assertAscending(knots, "smoother");
  const n = knots.length;
  return {
    at: (i, u) => smootherJet(knots, values, i, u)[0],
    bezier: (i) => {
      const interior = i > 0 && i < n - 2;
      const pieces = interior ? SMOOTHER_PIECES : 1;
      // Each piece is the cubic Hermite through the curve's exact value and
      // velocity at its two ends, over its share of the segment.
      const h = (knots[i + 1] - knots[i]) / pieces;
      const out: number[] = [];
      let [v0, m0] = smootherJet(knots, values, i, 0);
      for (let k = 1; k <= pieces; k++) {
        const [v1, m1] = smootherJet(knots, values, i, k / pieces);
        out.push(v0, v0 + (h / 3) * m0, v1 - (h / 3) * m1, v1);
        v0 = v1;
        m0 = m1;
      }
      return out;
    },
  };
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

/** Thread a run of points with one cubic per knot interval, with the
 *  velocity `slopes` gives each knot: each coordinate is a channel of the
 *  same spline. Fewer than two points thread nothing. */
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
 *  and `monotoneJet` read. */
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

/** One channel at local parameter `u` of segment `i` of cubics from
 *  `monotoneCubics`, with its first and second derivatives with respect to
 *  the knot parameter. The velocity is continuous across a knot, but the
 *  acceleration jumps there, so the derivatives belong to one segment. They
 *  divide by its length, `knots[i + 1] − knots[i]`. */
export function monotoneJet(
  knots: number[],
  cubics: number[],
  i: number,
  u: number
): [value: number, velocity: number, acceleration: number] {
  const k = 4 * i;
  const b0 = cubics[k];
  const b1 = cubics[k + 1];
  const b2 = cubics[k + 2];
  const b3 = cubics[k + 3];
  const h = knots[i + 1] - knots[i];
  const v = 1 - u;
  return [
    bernstein(b0, b1, b2, b3, u),
    (3 * (v * v * (b1 - b0) + 2 * v * u * (b2 - b1) + u * u * (b3 - b2))) / h,
    (6 * (v * (b2 - 2 * b1 + b0) + u * (b3 - 2 * b2 + b1))) / (h * h),
  ];
}

/** Thread a run of points with a smooth curve over `knots`: each coordinate
 *  is a channel of the same curve. The path comes back as one step per knot
 *  interval, and a step is the cubics that draw that interval
 *  (`ChannelSpline.bezier`), which split its share of the parameter evenly.
 *  Fewer than two points thread nothing.
 *
 *  A point at the same knot as the one before it repeats that point, as d3
 *  drops a coincident point: the curve is worked out over the distinct
 *  points, and the repeat's step, of zero length, is one cubic that joins the
 *  two. Every input interval keeps its step, so a time window can still cut
 *  the path by index. Centripetal knots are the only ones that repeat: a
 *  run's own parameter never does (`connect` only takes one that moves one
 *  way), and centripetal knots repeat where two points are the same up to
 *  rounding (`samePoint`). */
export function threadPath(
  points: Point[],
  knots: number[],
  smooth: SmoothCurve
): BezierCurve[][] {
  // The distinct points, and for each input point the distinct one it is.
  const kept: number[] = [];
  const keptAt: number[] = [];
  points.forEach((_, i) => {
    const last = kept[kept.length - 1];
    const repeats = last !== undefined && knots[i] === knots[last];
    if (!repeats) kept.push(i);
    keptAt.push(kept.length - 1);
  });
  const channel = (c: 0 | 1) =>
    channelSpline(
      smooth,
      kept.map((i) => knots[i]),
      kept.map((i) => points[i][c])
    );
  const xs = channel(0);
  const ys = channel(1);
  const steps: BezierCurve[][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (keptAt[i + 1] === keptAt[i]) {
      steps.push([curve(start, start, end, end)]);
      continue;
    }
    const bx = xs.bezier(keptAt[i]);
    const by = ys.bezier(keptAt[i]);
    const step: BezierCurve[] = [];
    for (let k = 0; k < bx.length; k += 4) {
      // The step's ends are the input points themselves, which a repeat can
      // differ from by rounding.
      step.push(
        curve(
          k === 0 ? start : [bx[k], by[k]],
          [bx[k + 1], by[k + 1]],
          [bx[k + 2], by[k + 2]],
          k + 4 === bx.length ? end : [bx[k + 3], by[k + 3]]
        )
      );
    }
    steps.push(step);
  }
  return steps;
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
 *  on screen. Two points that are the same up to rounding (`samePoint`) are
 *  one point, so the interval between them is exactly 0. */
export function centripetalKnots(points: Point[]): number[] {
  const knots = points.length === 0 ? [] : [0];
  for (let i = 1; i < points.length; i++) {
    if (samePoint(points[i], points[i - 1])) {
      knots.push(knots[i - 1]);
      continue;
    }
    const distance = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1]
    );
    knots.push(knots[i - 1] + Math.sqrt(distance));
  }
  return knots;
}
