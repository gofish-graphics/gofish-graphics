/**
 * Unit tests for the smooth curves (`src/spline.ts`): the monotone cubic,
 * which `time.transition()`, `interpolate()`, `line` and `ribbon` go through,
 * and the screen-space centripetal Catmull-Rom. Run:
 * `tsx src/tests/spline.test.ts` (wired into `pnpm test` as `test:spline`).
 *
 * The monotone contract: it is Steffen's cubic with zero-curvature ends, the
 * same curve as d3's `curveMonotoneX`; between two knots each channel stays
 * within its two end values; a path's cubic at local `u` is the reading at the
 * matching time `t`; a repeated point is dropped as d3 drops it; and the
 * knots must be strictly ascending. The Catmull-Rom
 * contract: its knots are always centripetal, and it is the Barry-Goldman
 * spline over them.
 *
 * The `smooth` contract: it is SciPy's modified Akima (`makima`) cubic, and a
 * run of equal values stays flat, and a path's cubic at local `u` is the
 * reading at the matching time `t`.
 */

import {
  SMOOTH_CURVES,
  catmullRomPath,
  centripetalKnots,
  channelSpline,
  monotoneSlopes,
  smoothSlopes,
  stepPath,
  threadPath,
} from "../spline";
import {
  channelReader,
  interpolateMonotone,
  interpolateRun,
  locate,
} from "../interpolate";
import {
  type BezierCurve,
  type Path,
  type Point,
  reversePath,
  subdivideCurve1,
} from "../path";
import { drivingShifts } from "../data/drivingShifts";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

/** A seeded random stream (mulberry32), so a failure reproduces. */
const random = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A random run: `n` points in a 500px box, at strictly increasing knots
 *  whose gaps differ by up to a hundredfold. */
function randomRun(rand: () => number, n: number) {
  const knots = [rand() * 100];
  for (let i = 1; i < n; i++) knots.push(knots[i - 1] + 0.1 + rand() * 10);
  const points: Point[] = knots.map(() => [rand() * 500, rand() * 500]);
  return { knots, points };
}

/** A run threaded with the monotone cubic, which draws each step with ONE
 *  cubic, so the path is those cubics in order. */
const monotonePath = (points: Point[], knots: number[]) =>
  threadPath(points, knots, "monotone").map(({ segments }) => {
    if (segments.length !== 1) throw new Error("a monotone step is one cubic");
    return segments[0] as BezierCurve;
  });

/** The point de Casteljau cuts a path's segment at, which is how
 *  `windowPath` cuts a threaded line. */
const pointAt = (path: ReturnType<typeof monotonePath>, i: number, u: number) =>
  subdivideCurve1(path[i], u)[0].end;

console.log("# monotone: no segment goes past its two end values");
{
  const rand = random(1990);
  let worst = 0;
  let checked = 0;
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + Math.floor(rand() * 9);
    const { knots, points } = randomRun(rand, n);
    const path = monotonePath(points, knots);
    for (let i = 0; i < path.length; i++) {
      for (let s = 0; s <= 50; s++) {
        const p = pointAt(path, i, s / 50);
        for (const c of [0, 1] as const) {
          const lo = Math.min(points[i][c], points[i + 1][c]);
          const hi = Math.max(points[i][c], points[i + 1][c]);
          worst = Math.max(worst, lo - p[c], p[c] - hi);
          checked++;
        }
      }
    }
  }
  ok(
    `${checked} samples on 300 random runs with uneven knots`,
    worst < 1e-9,
    `worst excursion ${worst}`
  );
}

console.log("# monotone: the same curve as d3's curveMonotoneX");
{
  // Reference control points from d3-shape 3.2.0's `curveMonotoneX`, which
  // is not a dependency of this package: they were recorded once by running
  // d3 on the same points, and are hard-coded here. `[c₁, c₂]` per segment.
  // The first twelve years of the driving-shifts data, gas price by year.
  const rows = drivingShifts.slice(0, 12);
  const gasByYear: Point[] = rows.map((d) => [d.year, d.gas]);
  const d3Gas = [
    [2.3899999999999997, 2.4],
    [2.4, 2.26],
    [2.26, 2.31],
    [2.31, 2.2800000000000002],
    [2.26, 2.2583333333333333],
    [2.2416666666666667, 2.24],
    [2.2, 2.126666666666667],
    [2.1133333333333333, 2.11],
    [2.11, 2.14],
    [2.14, 2.14],
    [2.14, 2.14],
  ];
  const gasPath = monotonePath(
    gasByYear,
    rows.map((d) => d.year)
  );
  let worst = 0;
  gasPath.forEach((seg, i) => {
    worst = Math.max(
      worst,
      Math.abs(seg.control1[1] - d3Gas[i][0]),
      Math.abs(seg.control2[1] - d3Gas[i][1]),
      Math.abs(seg.control1[0] - (gasByYear[i][0] + 1 / 3)),
      Math.abs(seg.control2[0] - (gasByYear[i][0] + 2 / 3))
    );
  });
  ok(
    "gas by year, 1956–1967",
    gasPath.length === d3Gas.length && worst < 1e-9,
    `worst gap ${worst}`
  );

  // Uneven gaps, a flat stretch, a turn and a short last-but-one interval.
  const uneven: Point[] = [
    [0, 3],
    [1, 7],
    [1.5, 6.5],
    [4, 6.5],
    [10, -2],
    [10.25, 4],
    [13, 5],
  ];
  const d3Uneven = [
    [0.3333333333333333, 5, 0.6666666666666667, 7],
    [1.1666666666666667, 7, 1.3333333333333333, 6.5],
    [2.3333333333333335, 6.5, 3.1666666666666665, 6.5],
    [6, 6.5, 8, -2],
    [10.083333333333334, -2, 10.166666666666666, 3.9393939393939394],
    [
      11.166666666666666, 4.666666666666667, 12.083333333333334,
      4.833333333333333,
    ],
  ];
  const unevenPath = monotonePath(
    uneven,
    uneven.map((p) => p[0])
  );
  worst = 0;
  unevenPath.forEach((seg, i) => {
    const [a, b, c, d] = d3Uneven[i];
    worst = Math.max(
      worst,
      Math.abs(seg.control1[0] - a),
      Math.abs(seg.control1[1] - b),
      Math.abs(seg.control2[0] - c),
      Math.abs(seg.control2[1] - d)
    );
  });
  ok("uneven knots with a turn", worst < 1e-9, `worst gap ${worst}`);
}

console.log("# monotone: slopes");
{
  // On y = x², the parabola through three neighbors is y = x² itself, so
  // each interior slope is its derivative 2x, which the limits leave alone.
  const xs = [0, 1, 2, 3, 4];
  const m = monotoneSlopes(
    xs,
    xs.map((x) => x * x)
  );
  ok(
    "interior slopes are exact on y = x²",
    [1, 2, 3].every((i) => near(m[i], 2 * xs[i])),
    JSON.stringify(m)
  );
  ok(
    "a turn has slope 0, so the peak sits on its knot",
    monotoneSlopes([0, 1, 2], [0, 5, 1])[1] === 0
  );
  ok(
    "the ends have zero curvature",
    near(m[0], (3 * 1 - m[1]) / 2) && near(m[4], (3 * 7 - m[3]) / 2),
    JSON.stringify(m)
  );
  const [seg] = monotonePath(
    [
      [0, 0],
      [30, 60],
    ],
    [0, 1]
  );
  ok(
    "a two-point run is one straight cubic",
    near(seg.control1[0], 10) &&
      near(seg.control1[1], 20) &&
      near(seg.control2[0], 20) &&
      near(seg.control2[1], 40),
    JSON.stringify(seg)
  );
  // A constant rate on uneven knots is read at that rate everywhere,
  // including the first and last intervals.
  const knots = [0, 5, 10, 20];
  const affine = knots.map((t) => 3 * t + 7);
  let worst = 0;
  for (let t = 0; t <= 20; t += 0.25) {
    worst = Math.max(
      worst,
      Math.abs(interpolateMonotone(knots, affine, t) - (3 * t + 7))
    );
  }
  ok("reads 3t + 7 on a grid over the whole run", worst < 1e-9, `${worst}`);
}

console.log("# monotone: the same curve as d3 on a repeated point");
{
  // Reference segments `[c₁x, c₁y, c₂x, c₂y, x, y]` recorded from d3-shape
  // 3.2.0's `curveMonotoneX` on the same points, as above. d3 skips a point
  // that repeats the one before it, so it draws no segment for it; the
  // monotone path keeps one, a single point, which is dropped here before
  // comparing.
  const cases: { run: Point[]; d3: number[][] }[] = [
    {
      // A repeated point in the middle.
      run: [
        [0, 0],
        [1, 2],
        [1, 2],
        [2, 1],
        [3, 3],
      ],
      d3: [
        [0.3333333333333333, 1, 0.6666666666666667, 2, 1, 2],
        [1.3333333333333333, 2, 1.6666666666666667, 1, 2, 1],
        [2.3333333333333335, 1, 2.6666666666666665, 2, 3, 3],
      ],
    },
    {
      // A repeated point at the end.
      run: [
        [0, 0],
        [1, 2],
        [2, 1],
        [2, 1],
      ],
      d3: [
        [0.3333333333333333, 1, 0.6666666666666667, 2, 1, 2],
        [1.3333333333333333, 2, 1.6666666666666667, 1.5, 2, 1],
      ],
    },
  ];
  for (const { run, d3 } of cases) {
    const path = monotonePath(
      run,
      run.map((p) => p[0])
    );
    const numbers = path.flatMap((c) => [
      ...c.start,
      ...c.control1,
      ...c.control2,
      ...c.end,
    ]);
    const drawn = path
      .filter((c) => !(c.start[0] === c.end[0] && c.start[1] === c.end[1]))
      .map((c) => [...c.control1, ...c.control2, ...c.end]);
    const worst =
      drawn.length !== d3.length
        ? Infinity
        : Math.max(
            0,
            ...drawn.flatMap((seg, i) =>
              seg.map((x, k) => Math.abs(x - d3[i][k]))
            )
          );
    ok(
      `${JSON.stringify(run)}: finite, and d3's segments`,
      numbers.every(Number.isFinite) && worst < 1e-9,
      `worst gap ${worst}`
    );
  }
  // The repeated point's own segment is that point.
  const [, repeat] = monotonePath(
    [
      [0, 0],
      [1, 2],
      [1, 2],
      [2, 1],
    ],
    [0, 1, 1, 2]
  );
  ok(
    "a repeated point's segment is a point",
    [repeat.start, repeat.control1, repeat.control2, repeat.end].every(
      ([x, y]) => x === 1 && y === 2
    ),
    JSON.stringify(repeat)
  );
}

console.log("# monotone: a point off by rounding is a repeated point");
{
  // Threaded as a run with no parameter of its own, on centripetal knots.
  const thread = (points: Point[]) =>
    monotonePath(points, centripetalKnots(points));
  const exact = thread([
    [0, 0],
    [50, 50],
    [50, 50],
    [100, 0],
  ]);
  const noisy = thread([
    [0, 0],
    [50, 50],
    [50 + 1e-10, 50],
    [100, 0],
  ]);
  const numbers = (path: typeof exact) =>
    path.flatMap((c) => [...c.start, ...c.control1, ...c.control2, ...c.end]);
  const a = numbers(exact);
  const b = numbers(noisy);
  ok(
    "the same path as the exact repeat",
    a.length === b.length && a.every((x, i) => near(x, b[i])),
    JSON.stringify(noisy)
  );
  // Knots that round to one value where the points do not quite coincide
  // are one moment, so they are one point too, and nothing throws.
  let threw = false;
  try {
    monotonePath(
      [
        [0, 0],
        [50, 50],
        [50, 51],
        [100, 0],
      ],
      [0, 1e20, 1e20, 2e20]
    );
  } catch {
    threw = true;
  }
  ok("a repeated knot does not throw", !threw);
}

console.log("# monotone: the knots must be strictly ascending");
{
  const throws = (knots: number[]) => {
    try {
      monotoneSlopes(
        knots,
        knots.map(() => 1)
      );
      return false;
    } catch {
      return true;
    }
  };
  ok("monotoneSlopes throws on a zero gap", throws([0, 1, 1, 2]));
  ok("monotoneSlopes throws on a negative gap", throws([0, 2, 1]));
  ok(
    "a NaN knot does not throw, and yields NaN",
    !throws([0, NaN, 2]) &&
      monotoneSlopes([0, NaN, 2], [0, 1, 2]).some(Number.isNaN)
  );
}

console.log("# a path's cubic at u is the reading at the matching t");
{
  const rand = random(635);
  const us = [0, 0.1, 0.37, 0.5, 0.9, 1];
  let worst = 0;
  let checked = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 2 + Math.floor(rand() * 7);
    const { knots, points } = randomRun(rand, n);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const path = monotonePath(points, knots);
    if (path.length !== n - 1) {
      worst = Infinity;
      break;
    }
    for (let i = 0; i < path.length; i++) {
      for (const u of us) {
        const [x, y] = pointAt(path, i, u);
        const t = knots[i] + u * (knots[i + 1] - knots[i]);
        worst = Math.max(
          worst,
          Math.abs(x - interpolateMonotone(knots, xs, t)),
          Math.abs(y - interpolateMonotone(knots, ys, t))
        );
        checked++;
      }
    }
  }
  ok(
    `${checked} points on 200 random runs, end segments included`,
    worst < 1e-9,
    `worst gap ${worst}`
  );
}

console.log("# a prepared channel reads what a single read reads");
{
  // A transition prepares each channel once (`channelReader`, with a smooth
  // run's cubics worked out ahead) and reads it every frame; `interpolateRun`
  // works one reading out on its own. They must agree to the last bit.
  const rand = random(831);
  let mismatches = 0;
  for (let trial = 0; trial < 100; trial++) {
    const n = 1 + Math.floor(rand() * 8);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[0]);
    for (const method of ["step", "linear", ...SMOOTH_CURVES] as const) {
      const read = channelReader(knots, values, method);
      for (let s = -2; s <= 42; s++) {
        const t = knots[0] + (s / 40) * (knots[n - 1] - knots[0] || 1);
        const at = n < 2 ? { i: 0, u: 0 } : locate(knots, t);
        if (!Object.is(read(at), interpolateRun(knots, values, t, method))) {
          mismatches++;
        }
      }
    }
  }
  ok("on 100 random runs, every method", mismatches === 0, `${mismatches}`);
}

console.log("# the jet's derivatives are the value's");
{
  const rand = random(2026);
  let worst = 0;
  for (let trial = 0; trial < 300; trial++) {
    const curve = SMOOTH_CURVES[trial % SMOOTH_CURVES.length];
    const n = 2 + Math.floor(rand() * 7);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[1]);
    const i = Math.floor(rand() * (n - 1));
    const span = knots[i + 1] - knots[i];
    const u = 0.1 + 0.8 * rand();
    const h = 1e-4;
    const spline = channelSpline(curve, knots, values);
    const value = (du: number) => spline.jet(i, u + du)[0];
    const [, velocity, acceleration] = spline.jet(i, u);
    // Central differences in u, converted to per unit of the knot parameter.
    const dv = (value(h) - value(-h)) / (2 * h) / span;
    const da = (value(h) - 2 * value(0) + value(-h)) / (h * h) / (span * span);
    worst = Math.max(
      worst,
      Math.abs(dv - velocity) / (1 + Math.abs(velocity)),
      Math.abs(da - acceleration) / (1 + Math.abs(acceleration))
    );
  }
  ok(
    "for every smooth curve, velocity and acceleration match differences",
    worst < 1e-3,
    `${worst}`
  );
  const [, velocity] = channelSpline("monotone", [0, 1, 2], [0, 5, 1]).jet(0, 1);
  ok("the velocity at a turn is 0", velocity === 0, `${velocity}`);
}

console.log("# catmullRom: the Barry-Goldman spline over centripetal knots");
{
  // The textbook construction, written out independently: the pyramid of
  // lerps over four neighbors, with the missing neighbor at an end being the
  // end interval reflected outward (p₋₁ = 2p₀ − p₁ at t₋₁ = 2t₀ − t₁).
  const pyramid = (knots: number[], values: number[], t: number): number => {
    const n = knots.length;
    let i = 0;
    while (i < n - 2 && knots[i + 1] <= t) i++;
    const k = (j: number) =>
      j < 0
        ? 2 * knots[0] - knots[1]
        : j >= n
          ? 2 * knots[n - 1] - knots[n - 2]
          : knots[j];
    const p = (j: number) =>
      j < 0
        ? 2 * values[0] - values[1]
        : j >= n
          ? 2 * values[n - 1] - values[n - 2]
          : values[j];
    const lerp = (a: number, b: number, ta: number, tb: number) =>
      ((tb - t) * a + (t - ta) * b) / (tb - ta);
    const [t0, t1, t2, t3] = [k(i - 1), k(i), k(i + 1), k(i + 2)];
    const a1 = lerp(p(i - 1), p(i), t0, t1);
    const a2 = lerp(p(i), p(i + 1), t1, t2);
    const a3 = lerp(p(i + 1), p(i + 2), t2, t3);
    return lerp(lerp(a1, a2, t0, t2), lerp(a2, a3, t1, t3), t1, t2);
  };
  const rand = random(903);
  let worst = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 2 + Math.floor(rand() * 7);
    const { points } = randomRun(rand, n);
    const knots = centripetalKnots(points);
    const path = catmullRomPath(points);
    for (let i = 0; i < path.length; i++) {
      for (let s = 0; s <= 10; s++) {
        const u = s / 10;
        const t = knots[i] + u * (knots[i + 1] - knots[i]);
        const p = pointAt(path, i, u);
        for (const c of [0, 1] as const) {
          const values = points.map((q) => q[c]);
          worst = Math.max(worst, Math.abs(p[c] - pyramid(knots, values, t)));
        }
      }
    }
  }
  ok("agrees with the pyramid on 200 random runs", worst < 1e-9, `${worst}`);

  const [seg] = catmullRomPath([
    [0, 0],
    [30, 60],
  ]);
  ok(
    "a two-point run is one straight cubic",
    near(seg.control1[0], 10) &&
      near(seg.control1[1], 20) &&
      near(seg.control2[0], 20) &&
      near(seg.control2[1], 40),
    JSON.stringify(seg)
  );
}

console.log("# centripetal knots");
{
  const knots = centripetalKnots([
    [0, 0],
    [3, 4],
    [3, 13],
  ]);
  ok(
    "each interval is the square root of the distance",
    near(knots[0], 0) &&
      near(knots[1], Math.sqrt(5)) &&
      near(knots[2], Math.sqrt(5) + 3),
    JSON.stringify(knots)
  );
  // Two points at one spot make an interval of zero length, which the
  // Catmull-Rom's tangent reads as a place the run ends. The path stays
  // finite and the zero-length segment is a point.
  const points: Point[] = [
    [0, 0],
    [10, 5],
    [10, 5],
    [20, 0],
  ];
  const path = catmullRomPath(points);
  const numbers = path.flatMap((c) => [
    ...c.start,
    ...c.control1,
    ...c.control2,
    ...c.end,
  ]);
  ok(
    "a repeated point stays finite",
    numbers.every(Number.isFinite),
    JSON.stringify(path)
  );
  ok(
    "and its segment is a point",
    [path[1].control1, path[1].control2].every(
      ([x, y]) => near(x, 10) && near(y, 5)
    )
  );
}

console.log("# smooth: the same curve as SciPy's makima");
{
  // Reference slopes and values from SciPy 1.18's
  // `Akima1DInterpolator(t, v, method="makima")`, which is not a dependency
  // of this package: they were recorded once and are hard-coded here. The
  // values are read at u = 0.25, 0.5 and 0.8 of every segment.
  const cases = [
    {
      name: "Akima's 1970 data",
      t: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      v: [10, 10, 10, 10, 10, 10, 10.5, 15, 50, 60, 85],
      slopes: [
        0, 0, 0, 0, 0, 0, 0.5588235294117647, 8.171296296296296,
        19.818731117824772, 17.5, 30.131578947368425,
      ],
      values: [
        10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
        10.051930147058822, 10.180147058823529, 10.376470588235293,
        10.898680044934641, 11.798440904139433, 13.50395642701525,
        20.688835520518627, 31.044070647308942, 44.0846838983999,
        53.52919656344411, 55.289841389728096, 57.354199395770394,
        64.95476973684211, 70.92105263157895, 79.10315789473687,
      ],
    },
    {
      name: "a step",
      t: [0, 1, 2, 3, 4, 5, 6, 7],
      v: [0, 0, 0, 0, 1, 1, 1, 1],
      slopes: [0, 0, 0, 0, 0, 0, 0, 0],
      values: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0.15625, 0.5, 0.8959999999999997, 1, 1, 1,
        1, 1, 1, 1, 1, 1,
      ],
    },
    {
      name: "uneven knots",
      t: [0, 0.5, 2, 2.3, 5, 9, 9.4],
      v: [1, 3, 2, -1, 4, 4.5, 0],
      slopes: [
        5.343434343434343, 2.0000000000000004, -3.3222407099278985,
        0.0004439117503416412, 1.0150031696837354, -0.8704397940913158,
        -14.652455849889616,
      ],
      values: [
        1.6413352272727273, 2.208964646464646, 2.749494949494949,
        3.499220049916805, 3.4979201331114806, 2.8378702163061558,
        1.391086727540925, 0.3753993266870662, -0.7199105570265196,
        -0.34704279092039036, 1.1575862504474792, 3.1292532585325303,
        4.812271744339223, 5.192721481887526, 5.023585580294273,
        4.022646308767798, 2.9391008027899277, 1.2070641101499804,
      ],
    },
    {
      name: "three values",
      t: [0, 1, 3],
      v: [0, 2, 1],
      slopes: [2.7065217391304346, 0.5625, -1.3125],
      values: [
        0.6667374320652174, 1.2680027173913042, 1.8066086956521739, 2.125,
        1.96875, 1.4759999999999995,
      ],
    },
  ];
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-12 * (1 + Math.abs(b));
  for (const { name, t, v, slopes, values } of cases) {
    const m = smoothSlopes(t, v);
    const spline = channelSpline("smooth", t, v);
    const read: number[] = [];
    for (let i = 0; i + 1 < t.length; i++) {
      for (const u of [0.25, 0.5, 0.8]) read.push(spline.at(i, u));
    }
    ok(
      `${name}: slopes and values match to 1e-12`,
      m.every((s, i) => close(s, slopes[i])) &&
        read.every((x, i) => close(x, values[i])),
      JSON.stringify({ m, read })
    );
  }
}

console.log("# smooth: a run of three or more equal values stays flat");
{
  // Akima's data is flat for its first five segments: the curve must not
  // move there at all, though it rounds the turn after the flat run.
  const t = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const v = [10, 10, 10, 10, 10, 10, 10.5, 15, 50, 60, 85];
  const spline = channelSpline("smooth", t, v);
  let worst = 0;
  for (let i = 0; i < 5; i++) {
    for (let s = 0; s <= 100; s++) {
      worst = Math.max(worst, Math.abs(spline.at(i, s / 100) - 10));
    }
  }
  ok("Akima's flat run stays at 10", worst < 1e-12, `${worst}`);
  // Random runs with flat stretches inserted: every flat interval next to
  // another flat interval has both end slopes exactly 0. (A lone flat
  // interval between two changes can bow, as it does in SciPy.)
  const rand = random(2019);
  let bad = 0;
  let flats = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 3 + Math.floor(rand() * 8);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[1]);
    for (let i = 1; i < n; i++) if (rand() < 0.4) values[i] = values[i - 1];
    const m = smoothSlopes(knots, values);
    const flat = (i: number) =>
      i >= 0 && i + 1 < n && values[i] === values[i + 1];
    for (let i = 0; i + 1 < n; i++) {
      if (!flat(i) || !(flat(i - 1) || flat(i + 1))) continue;
      flats++;
      if (m[i] !== 0 || m[i + 1] !== 0) bad++;
    }
  }
  ok(
    `${flats} flat intervals in runs of equal values, on 200 random runs`,
    bad === 0,
    `${bad} moved`
  );
}

console.log("# smooth: small runs, and the knots' order");
{
  const two = [0, 4];
  const twoValues = [1, 9];
  const spline = channelSpline("smooth", two, twoValues);
  ok(
    "two values are a straight line",
    [0, 0.3, 0.5, 1].every((u) => near(spline.at(0, u), 1 + 8 * u, 1e-12))
  );
  const throws = (f: () => unknown) => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  for (const [name, knots] of [
    ["a zero gap", [0, 1, 1, 2]],
    ["a negative gap", [0, 2, 1, 3]],
  ] as const) {
    ok(
      `smooth throws on ${name}`,
      throws(() => smoothSlopes([...knots], [0, 1, 2, 3])) &&
        throws(() => channelSpline("smooth", [...knots], [0, 1, 2, 3]))
    );
  }
}

console.log("# smooth: a path's steps are the readings over time");
{
  const rand = random(957);
  let worst = 0;
  let shapeOk = true;
  for (let trial = 0; trial < 100; trial++) {
    const n = 2 + Math.floor(rand() * 8);
    const { knots, points } = randomRun(rand, n);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const threaded = threadPath(points, knots, "smooth");
    if (threaded.length !== n - 1) shapeOk = false;
    threaded.forEach(({ segments, spans }, i) => {
      // One cubic per step, taking all of its time, from its point to the
      // next.
      if (segments.length !== 1 || spans[0] !== 1) {
        shapeOk = false;
        return;
      }
      const cubic = segments[0] as BezierCurve;
      if (cubic.start !== points[i] || cubic.end !== points[i + 1]) {
        shapeOk = false;
      }
      for (const u of [0.13, 0.5, 0.77]) {
        const [x, y] = subdivideCurve1(cubic, u)[0].end;
        const t = knots[i] + u * (knots[i + 1] - knots[i]);
        worst = Math.max(
          worst,
          Math.abs(x - interpolateRun(knots, xs, t, "smooth")),
          Math.abs(y - interpolateRun(knots, ys, t, "smooth"))
        );
      }
    });
  }
  ok("one cubic per interval, each from its point to the next", shapeOk);
  ok("exactly the reading", worst <= 1e-9, `${worst}`);
}

console.log("# step: step-after over the run's parameter");
{
  // Reference vertices from d3-shape 3.2.0's `curveStepAfter`, recorded once
  // on the first eight years of the driving-shifts data (gas by year), and
  // for the lower edge of `area().y0(gas / 2).y1(gas)`, which d3 draws back
  // from the last year to the first.
  const rows = drivingShifts.slice(0, 8);
  const d3Line: Point[] = [
    [1956, 2.38], [1957, 2.38], [1957, 2.4], [1958, 2.4], [1958, 2.26],
    [1959, 2.26], [1959, 2.31], [1960, 2.31], [1960, 2.27], [1961, 2.27],
    [1961, 2.25], [1962, 2.25], [1962, 2.22], [1963, 2.22], [1963, 2.12],
  ];
  const d3Lower: Point[] = [
    [1963, 1.06], [1963, 1.11], [1962, 1.11], [1962, 1.125], [1961, 1.125],
    [1961, 1.135], [1960, 1.135], [1960, 1.155], [1959, 1.155], [1959, 1.13],
    [1958, 1.13], [1958, 1.2], [1957, 1.2], [1957, 1.19], [1956, 1.19],
  ];
  const verticesOf = (path: Path): Point[] => {
    const ends = (seg: Path[number]): [Point, Point] =>
      seg.type === "line" ? seg.points : [seg.start, seg.end];
    return [ends(path[0])[0], ...path.map((seg) => ends(seg)[1])];
  };
  const same = (a: Point[], b: Point[]) =>
    a.length === b.length &&
    a.every((p, i) => near(p[0], b[i][0], 1e-12) && near(p[1], b[i][1], 1e-12));
  const byYear = stepPath(
    rows.map((d) => [d.year, d.gas] as Point),
    0
  );
  ok(
    "with x drawing the parameter, the staircase d3's curveStepAfter draws",
    same(verticesOf(byYear.flatMap((s) => s.segments)), d3Line),
    JSON.stringify(verticesOf(byYear.flatMap((s) => s.segments)))
  );
  const lower = stepPath(
    rows.map((d) => [d.year, d.gas / 2] as Point),
    0
  );
  ok(
    "and a band's far edge, drawn back, is the lower edge of d3's stepped area",
    same(verticesOf(reversePath(lower.flatMap((s) => s.segments))), d3Lower)
  );
  ok(
    "each step holds for all of its time, and its riser is an instant",
    byYear.every(
      ({ segments, spans }) =>
        segments.length === 2 && spans[0] === 1 && spans[1] === 0
    )
  );
  // No coordinate draws the parameter: both hold, so the hold is the point
  // itself and the riser runs straight to the next point.
  const points: Point[] = [
    [0, 0],
    [40, 10],
    [20, 30],
  ];
  const diagonal = stepPath(points);
  ok(
    "with no coordinate drawing it, each hold is a point and each riser a diagonal",
    diagonal.every(({ segments: [hold, riser] }, i) => {
      if (hold.type !== "line" || riser.type !== "line") return false;
      return (
        hold.points[0] === points[i] &&
        hold.points[1][0] === points[i][0] &&
        hold.points[1][1] === points[i][1] &&
        riser.points[1] === points[i + 1]
      );
    })
  );
  ok("a single point threads nothing", stepPath([[1, 2]]).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
