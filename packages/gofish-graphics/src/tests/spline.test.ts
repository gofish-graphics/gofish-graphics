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
 * run of equal values stays flat. The `smoother` contract: it passes through
 * every value, its acceleration is continuous at every knot, it is local (a
 * value moves at most the two segments on each side of it), and the cubics
 * that draw it stay within the stated error of the curve, with their own
 * parameter linear in time.
 */

import {
  SMOOTHER_PIECES,
  SMOOTH_CURVES,
  catmullRomPath,
  centripetalKnots,
  channelSpline,
  monotoneCubics,
  monotoneJet,
  monotoneSlopes,
  smoothSlopes,
  smootherJet,
  threadPath,
} from "../spline";
import {
  channelReader,
  interpolateMonotone,
  interpolateRun,
  locate,
} from "../interpolate";
import { type Point, subdivideCurve1 } from "../path";
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
  threadPath(points, knots, "monotone").map((step) => {
    if (step.length !== 1) throw new Error("a monotone step is one cubic");
    return step[0];
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
  for (let trial = 0; trial < 100; trial++) {
    const n = 2 + Math.floor(rand() * 7);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[1]);
    const i = Math.floor(rand() * (n - 1));
    const span = knots[i + 1] - knots[i];
    const u = 0.1 + 0.8 * rand();
    const h = 1e-4;
    const cubics = monotoneCubics(knots, values);
    const value = (du: number) => monotoneJet(knots, cubics, i, u + du)[0];
    const [, velocity, acceleration] = monotoneJet(knots, cubics, i, u);
    // Central differences in u, converted to per unit of the knot parameter.
    const dv = (value(h) - value(-h)) / (2 * h) / span;
    const da = (value(h) - 2 * value(0) + value(-h)) / (h * h) / (span * span);
    worst = Math.max(
      worst,
      Math.abs(dv - velocity) / (1 + Math.abs(velocity)),
      Math.abs(da - acceleration) / (1 + Math.abs(acceleration))
    );
  }
  ok("velocity and acceleration match differences", worst < 1e-3, `${worst}`);
  const [, velocity] = monotoneJet(
    [0, 1, 2],
    monotoneCubics([0, 1, 2], [0, 5, 1]),
    0,
    1
  );
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

console.log("# smooth and smoother: small runs, and the knots' order");
{
  const two = [0, 4];
  const twoValues = [1, 9];
  ok(
    "two values are a straight line",
    (["smooth", "smoother"] as const).every((curve) => {
      const spline = channelSpline(curve, two, twoValues);
      return [0, 0.3, 0.5, 1].every((u) =>
        near(spline.at(0, u), 1 + 8 * u, 1e-12)
      );
    })
  );
  // Three values: both segments of `smoother` are end segments, so the whole
  // curve is the one parabola through the three points.
  const t3 = [0, 1, 3];
  const v3 = [0, 2, 1];
  const parabola = (x: number) =>
    (0 * (x - 1) * (x - 3)) / 3 +
    (2 * x * (x - 3)) / -2 +
    (1 * x * (x - 1)) / 6;
  const three = channelSpline("smoother", t3, v3);
  ok(
    "smoother through three values is their parabola",
    [0, 0.2, 0.5, 0.9].every(
      (u) =>
        near(three.at(0, u), parabola(u), 1e-12) &&
        near(three.at(1, u), parabola(1 + 2 * u), 1e-12)
    )
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
      `smooth and smoother throw on ${name}`,
      throws(() => smoothSlopes([...knots], [0, 1, 2, 3])) &&
        throws(() => channelSpline("smoother", [...knots], [0, 1, 2, 3]))
    );
  }
}

/** The parabola through knots j − 1, j and j + 1 of a run, at x. */
function parabolaAt(t: number[], v: number[], j: number, x: number): number {
  const [a, b, c] = [t[j - 1], t[j], t[j + 1]];
  return (
    (v[j - 1] * (x - b) * (x - c)) / ((a - b) * (a - c)) +
    (v[j] * (x - a) * (x - c)) / ((b - a) * (b - c)) +
    (v[j + 1] * (x - a) * (x - b)) / ((c - a) * (c - b))
  );
}

console.log("# smoother: through every value, and C2 at every knot");
{
  const rand = random(2020);
  let worstValue = 0;
  let worstVelocity = 0;
  let worstAcceleration = 0;
  let monotoneJumps = 0;
  let knotsChecked = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 4 + Math.floor(rand() * 7);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[1]);
    const spline = channelSpline("smoother", knots, values);
    for (let i = 0; i + 1 < n; i++) {
      worstValue = Math.max(
        worstValue,
        Math.abs(spline.at(i, 0) - values[i]),
        Math.abs(spline.at(i, 1) - values[i + 1])
      );
    }
    // Velocity and acceleration from both sides of each interior knot: the
    // velocity from the jet, the acceleration by a second-order one-sided
    // difference of it.
    const cubics = monotoneCubics(knots, values);
    const d = 1e-5;
    const velocity = (i: number, u: number) =>
      smootherJet(knots, values, i, u)[1];
    for (let i = 1; i + 1 < n; i++) {
      const hl = knots[i] - knots[i - 1];
      const hr = knots[i + 1] - knots[i];
      const vl = velocity(i - 1, 1);
      const vr = velocity(i, 0);
      const al =
        (3 * vl - 4 * velocity(i - 1, 1 - d) + velocity(i - 1, 1 - 2 * d)) /
        (2 * d * hl);
      const ar =
        (-3 * vr + 4 * velocity(i, d) - velocity(i, 2 * d)) / (2 * d * hr);
      worstVelocity = Math.max(
        worstVelocity,
        Math.abs(vl - vr) / (1 + Math.abs(vr))
      );
      worstAcceleration = Math.max(
        worstAcceleration,
        Math.abs(al - ar) / (1 + Math.abs(ar))
      );
      // The same check on the monotone cubic, which is only C1, to show the
      // check can tell the two apart.
      const ml = monotoneJet(knots, cubics, i - 1, 1)[2];
      const mr = monotoneJet(knots, cubics, i, 0)[2];
      if (Math.abs(ml - mr) / (1 + Math.abs(mr)) > 1e-2) monotoneJumps++;
      knotsChecked++;
    }
  }
  ok("every value is on the curve", worstValue < 1e-9, `${worstValue}`);
  ok(
    `the velocity is continuous at ${knotsChecked} knots`,
    worstVelocity < 1e-9,
    `${worstVelocity}`
  );
  ok(
    "and so is the acceleration",
    worstAcceleration < 1e-5,
    `${worstAcceleration}`
  );
  ok(
    `while the monotone cubic's jumps at most of them (${monotoneJumps})`,
    monotoneJumps > knotsChecked / 2
  );
}

console.log("# smoother: moving one value moves at most two segments each side");
{
  const rand = random(4);
  let leaks = 0;
  let unmoved = 0;
  for (let trial = 0; trial < 100; trial++) {
    const n = 4 + Math.floor(rand() * 8);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[1]);
    const k = Math.floor(rand() * n);
    const moved = values.slice();
    moved[k] += 50;
    const before = channelSpline("smoother", knots, values);
    const after = channelSpline("smoother", knots, moved);
    for (let i = 0; i + 1 < n; i++) {
      const changes = [0.1, 0.5, 0.9].some(
        (u) => before.at(i, u) !== after.at(i, u)
      );
      const inReach = i >= k - 2 && i <= k + 1;
      if (changes && !inReach) leaks++;
      if (!changes && (i === k - 1 || i === k)) unmoved++;
    }
  }
  ok("no segment outside k − 2 .. k + 1 moves", leaks === 0, `${leaks}`);
  ok("the two segments at the value do move", unmoved === 0, `${unmoved}`);
}

console.log("# smoother: its cubics stay within the stated error");
{
  // The stated bound (`SMOOTHER_PIECES`): at most 3.9e-5 times the gap D
  // between the two parabolas a segment blends, at its middle. Each cubic's
  // own parameter s is linear in time, so cubic j at s is compared with the
  // curve at u = (j + s) / k.
  const rand = random(12);
  let worstRatio = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 4 + Math.floor(rand() * 7);
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[1]);
    const spline = channelSpline("smoother", knots, values);
    for (let i = 0; i + 1 < n; i++) {
      const b = spline.bezier(i);
      const interior = i > 0 && i < n - 2;
      const pieces = b.length / 4;
      if (pieces !== (interior ? SMOOTHER_PIECES : 1)) worstRatio = Infinity;
      let err = 0;
      for (let j = 0; j < pieces; j++) {
        for (let s = 0; s <= 40; s++) {
          const u = (j + s / 40) / pieces;
          const cubic = b.slice(4 * j, 4 * j + 4);
          const drawn =
            (1 - s / 40) ** 3 * cubic[0] +
            3 * (1 - s / 40) ** 2 * (s / 40) * cubic[1] +
            3 * (1 - s / 40) * (s / 40) ** 2 * cubic[2] +
            (s / 40) ** 3 * cubic[3];
          err = Math.max(err, Math.abs(drawn - spline.at(i, u)));
        }
      }
      if (!interior) {
        // An end segment is a parabola, which one cubic draws exactly.
        worstRatio = Math.max(worstRatio, err > 1e-9 ? Infinity : 0);
        continue;
      }
      const mid = (knots[i] + knots[i + 1]) / 2;
      const gap = Math.abs(
        parabolaAt(knots, values, i, mid) - parabolaAt(knots, values, i + 1, mid)
      );
      if (gap > 1e-6) worstRatio = Math.max(worstRatio, err / gap);
    }
  }
  ok(
    "error / gap is at most 3.9e-5",
    worstRatio <= 3.9e-5,
    `worst ${worstRatio}`
  );
  // A connected scatter plot of the driving-shifts data in a 500px box, over
  // its years: the case the error is sized for.
  const xs = drivingShifts.map((d) => d.miles);
  const ys = drivingShifts.map((d) => d.gas);
  const box = (vs: number[]) => {
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return vs.map((v) => ((v - lo) / (hi - lo)) * 500);
  };
  const years = drivingShifts.map((d) => d.year);
  let worstPx = 0;
  for (const values of [box(xs), box(ys)]) {
    const spline = channelSpline("smoother", years, values);
    for (let i = 0; i + 1 < years.length; i++) {
      const b = spline.bezier(i);
      const pieces = b.length / 4;
      for (let j = 0; j < pieces; j++) {
        for (let s = 0; s <= 40; s++) {
          const [c0, c1, c2, c3] = b.slice(4 * j, 4 * j + 4);
          const w = s / 40;
          const drawn =
            (1 - w) ** 3 * c0 +
            3 * (1 - w) ** 2 * w * c1 +
            3 * (1 - w) * w ** 2 * c2 +
            w ** 3 * c3;
          worstPx = Math.max(
            worstPx,
            Math.abs(drawn - spline.at(i, (j + w) / pieces))
          );
        }
      }
    }
  }
  ok(
    "under 0.01px on the driving-shifts scatter in a 500px box",
    worstPx < 0.01,
    `worst ${worstPx}px`
  );
}

console.log("# smooth and smoother: a path's steps are the readings over time");
{
  const rand = random(957);
  let worst = { smooth: 0, smoother: 0 };
  let shapeOk = true;
  for (let trial = 0; trial < 100; trial++) {
    const n = 2 + Math.floor(rand() * 8);
    const { knots, points } = randomRun(rand, n);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    for (const curve of ["smooth", "smoother"] as const) {
      const steps = threadPath(points, knots, curve);
      if (steps.length !== n - 1) shapeOk = false;
      steps.forEach((step, i) => {
        // The step runs from its point to the next, with no gaps between its
        // cubics.
        if (step[0].start !== points[i]) shapeOk = false;
        if (step[step.length - 1].end !== points[i + 1]) shapeOk = false;
        for (let j = 1; j < step.length; j++) {
          if (step[j].start[0] !== step[j - 1].end[0]) shapeOk = false;
        }
        // What the step may be off by: nothing for a cubic curve or an end
        // segment, and the stated drawing error (`SMOOTHER_PIECES`) for an
        // interior segment of `smoother`.
        const mid = (knots[i] + knots[i + 1]) / 2;
        const gap = (vs: number[]) =>
          Math.abs(parabolaAt(knots, vs, i, mid) - parabolaAt(knots, vs, i + 1, mid));
        const interior = curve === "smoother" && i > 0 && i < n - 2;
        const allowed = [xs, ys].map(
          (vs) => 1e-9 + (interior ? 3.9e-5 * gap(vs) : 0)
        );
        const k = step.length;
        for (const u of [0.13, 0.5, 0.77]) {
          const j = Math.floor(u * k);
          const [x, y] = subdivideCurve1(step[j], u * k - j)[0].end;
          const t = knots[i] + u * (knots[i + 1] - knots[i]);
          worst[curve] = Math.max(
            worst[curve],
            Math.abs(x - interpolateRun(knots, xs, t, curve)) / allowed[0],
            Math.abs(y - interpolateRun(knots, ys, t, curve)) / allowed[1]
          );
        }
      });
    }
  }
  ok("one step per interval, each from its point to the next", shapeOk);
  ok("smooth: exactly the reading", worst.smooth <= 1, `${worst.smooth}`);
  ok(
    "smoother: the reading, within the drawing error",
    worst.smoother <= 1,
    `${worst.smoother}`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
