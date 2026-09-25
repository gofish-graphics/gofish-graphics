/**
 * Unit tests for the one Catmull-Rom spline (`src/catmullRom.ts`), which
 * `time.transition()`, `interpolate()`, `line`, `ribbon` and adaptive
 * resampling all go through. Run: `tsx src/tests/catmullRom.test.ts` (wired
 * into `pnpm test` as `test:catmull-rom`).
 *
 * The contract: a path's cubic at local `u` is the reading at the matching
 * time `t`, on every segment including the two at the ends; the spline is
 * the Barry-Goldman (non-uniform) Catmull-Rom with the end interval reflected
 * outward; a two-point run is a straight line; and a run that changes at a
 * constant rate is read at that rate everywhere.
 */

import { catmullRomJet, catmullRomPath, centripetalKnots } from "../catmullRom";
import {
  channelReader,
  interpolateCatmullRom,
  interpolateRun,
  locate,
} from "../interpolate";
import { type Point, subdivideCurve1 } from "../path";

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
    const path = catmullRomPath(points, knots);
    if (path.length !== n - 1) {
      worst = Infinity;
      break;
    }
    for (let i = 0; i < path.length; i++) {
      for (const u of us) {
        // The point de Casteljau cuts the cubic at, which is how
        // `windowPath` cuts a threaded line.
        const [x, y] = subdivideCurve1(path[i], u)[0].end;
        const t = knots[i] + u * (knots[i + 1] - knots[i]);
        worst = Math.max(
          worst,
          Math.abs(x - interpolateCatmullRom(knots, xs, t)),
          Math.abs(y - interpolateCatmullRom(knots, ys, t))
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
    for (const method of ["step", "linear", "catmullRom"] as const) {
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

console.log(
  "# it is the Barry-Goldman spline, with the end interval reflected"
);
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
    const { knots, points } = randomRun(rand, n);
    const values = points.map((p) => p[0]);
    for (let s = 0; s <= 40; s++) {
      const t = knots[0] + (s / 40) * (knots[n - 1] - knots[0]);
      worst = Math.max(
        worst,
        Math.abs(
          interpolateCatmullRom(knots, values, t) - pyramid(knots, values, t)
        )
      );
    }
  }
  ok("agrees with the pyramid on 200 random runs", worst < 1e-9, `${worst}`);
}

console.log("# the ends keep the end interval's slope");
{
  const [seg] = catmullRomPath(
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
  ok(
    "and is read as a straight line",
    [0, 0.25, 0.5, 0.8, 1].every((t) =>
      near(interpolateCatmullRom([0, 1], [0, 30], t), 30 * t)
    )
  );

  // A constant rate on uneven knots is read at that rate everywhere,
  // including the first and last intervals.
  const knots = [0, 5, 10, 20];
  ok(
    "reads 2.5 at t = 2.5 (first interval)",
    near(interpolateCatmullRom(knots, knots, 2.5), 2.5)
  );
  ok(
    "reads 15 at t = 15 (last interval)",
    near(interpolateCatmullRom(knots, knots, 15), 15)
  );
  const affine = knots.map((t) => 3 * t + 7);
  let worst = 0;
  for (let t = 0; t <= 20; t += 0.25) {
    worst = Math.max(
      worst,
      Math.abs(interpolateCatmullRom(knots, affine, t) - (3 * t + 7))
    );
  }
  ok("reads 3t + 7 on a grid over the whole run", worst < 1e-9, `${worst}`);
  const [, velocity] = catmullRomJet(knots, affine, 0, 0);
  ok("leaves the first knot at the run's rate", near(velocity, 3));
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
  // tangent reads as a place the run ends. The path stays finite and the
  // zero-length segment is a point.
  const points: Point[] = [
    [0, 0],
    [10, 5],
    [10, 5],
    [20, 0],
  ];
  const path = catmullRomPath(points, centripetalKnots(points));
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
    const value = (du: number) => catmullRomJet(knots, values, i, u + du)[0];
    const [, velocity, acceleration] = catmullRomJet(knots, values, i, u);
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
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
