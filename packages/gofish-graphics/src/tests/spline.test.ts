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
 */

import {
  catmullRomPath,
  centripetalKnots,
  monotoneCubics,
  monotoneJet,
  monotonePath,
  monotoneSlopes,
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
    for (const method of ["step", "linear", "monotone"] as const) {
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
