/**
 * Unit tests for keyframe interpolation (`src/interpolate.ts`), the evaluator
 * behind `time.transition()`. Run: `tsx src/tests/interpolate.test.ts`
 * (wired into `pnpm test` as `test:interpolate`).
 *
 * The contract the transition depends on: knots are the DATA time values, so
 * an uneven run plays at an even speed; every keyframe is passed through
 * exactly; and a playhead outside the run holds the nearest endpoint.
 */

import {
  interpolateLinear,
  interpolateCatmullRom,
  interpolateStep,
  interpolateRun,
  interpolate,
  knotOrder,
} from "../interpolate";

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

console.log("# linear: piecewise between the bracketing keyframes");
{
  const knots = [1955, 1960, 1965];
  const values = [10, 20, 100];
  ok("hits the first knot", near(interpolateLinear(knots, values, 1955), 10));
  ok("hits a middle knot", near(interpolateLinear(knots, values, 1960), 20));
  ok("hits the last knot", near(interpolateLinear(knots, values, 1965), 100));
  ok(
    "midpoint of the first segment",
    near(interpolateLinear(knots, values, 1957.5), 15)
  );
  ok(
    "quarter of the second segment",
    near(interpolateLinear(knots, values, 1961.25), 40)
  );
  ok("clamps before the run", near(interpolateLinear(knots, values, 1900), 10));
  ok("clamps after the run", near(interpolateLinear(knots, values, 2100), 100));
  ok("a single keyframe holds", near(interpolateLinear([1955], [7], 1990), 7));
}

console.log("# step: holds the previous keyframe, then jumps");
{
  const knots = [1955, 1960, 1965];
  const values = [10, 20, 100];
  ok("hits the first knot", near(interpolateStep(knots, values, 1955), 10));
  ok(
    "holds the first value across its whole band",
    near(interpolateStep(knots, values, 1957.5), 10) &&
      near(interpolateStep(knots, values, 1959.999), 10)
  );
  ok(
    "jumps exactly at the next knot",
    near(interpolateStep(knots, values, 1960), 20)
  );
  ok(
    "holds the second value across its band",
    near(interpolateStep(knots, values, 1964), 20)
  );
  ok("hits the last knot", near(interpolateStep(knots, values, 1965), 100));
  ok("clamps before the run", near(interpolateStep(knots, values, 1900), 10));
  ok("clamps after the run", near(interpolateStep(knots, values, 2100), 100));
  ok("a single keyframe holds", near(interpolateStep([1955], [7], 1990), 7));
  ok("empty run is NaN", Number.isNaN(interpolateStep([], [], 0)));
  // The step run only ever takes values the run actually contains — the
  // property that makes it the same picture the keyframes alone draw.
  const taken = new Set<number>();
  for (let t = 1950; t <= 1970; t += 0.25)
    taken.add(interpolateStep(knots, values, t));
  ok(
    "takes no value that is not a keyframe's",
    [...taken].every((v) => values.includes(v)),
    `got ${[...taken].join(", ")}`
  );
}

console.log("# catmullRom: passes through every keyframe");
{
  const knots = [1955, 1960, 1965, 1970];
  const values = [10, 20, 15, 40];
  for (let i = 0; i < knots.length; i++) {
    ok(
      `interpolates knot ${knots[i]}`,
      near(interpolateCatmullRom(knots, values, knots[i]), values[i], 1e-9)
    );
  }
  ok(
    "clamps before the run",
    near(interpolateCatmullRom(knots, values, 1900), 10)
  );
  ok(
    "clamps after the run",
    near(interpolateCatmullRom(knots, values, 2100), 40)
  );
  // Between knots the spline overshoots a straight chord in general, but it
  // stays in the neighborhood of the segment it is in.
  const mid = interpolateCatmullRom(knots, values, 1962.5);
  ok("stays near its own segment", mid > 12 && mid < 23, `got ${mid}`);
}

console.log("# catmullRom: knots are data values, not uniform steps");
{
  // A straight line read at unevenly spaced knots comes back exactly. This is
  // the sharpest statement of "the knots are the data values": a uniformly
  // parameterized spline through the same points does NOT reproduce it (it
  // gives 7.1875 at 7.5 below), because it spends equal clock on unequal gaps.
  const line = [0, 5, 10, 20];
  ok(
    "an affine run is reproduced exactly",
    near(interpolateCatmullRom(line, line, 7.5), 7.5, 1e-9)
  );
  // The velocity leaving a knot is the non-uniform Catmull-Rom tangent
  //   m₁ = (p₁-p₀)/(t₁-t₀) − (p₂-p₀)/(t₂-t₀) + (p₂-p₁)/(t₂-t₁),
  // which is what the Barry-Goldman pyramid computes. On this run that is
  // 10 − 20/11 + 1 = 9.1818… per unit of t.
  const knots = [0, 1, 11];
  const values = [0, 10, 20];
  const h = 1e-4;
  const slope = (interpolateCatmullRom(knots, values, 1 + h) - 10) / h;
  ok(
    "leaves a knot at the non-uniform tangent",
    near(slope, 10 - 20 / 11 + 1, 1e-3),
    `got ${slope}`
  );
  // Uniform knots must agree with the textbook uniform Catmull-Rom, where the
  // tangent is the plain centered difference (p₂-p₀)/2.
  const uniform = [0, 1, 2, 3];
  const uvals = [0, 10, 20, 20];
  ok(
    "uniform knots agree with uniform Catmull-Rom",
    near(interpolateCatmullRom(uniform, uvals, 1.1), 11.045, 1e-9)
  );
}

console.log("# degenerate runs");
{
  ok(
    "two keyframes read as a straight line",
    near(interpolateCatmullRom([0, 10], [0, 100], 2.5), 25)
  );
  // Two keyframes at the same time value (duplicate rows for one year) must
  // not divide by zero; the run stays finite and inside its own values.
  const dup = interpolateLinear([0, 0, 1], [1, 2, 3], 0.5);
  ok(
    "duplicate knots stay finite",
    Number.isFinite(dup) && dup >= 1 && dup <= 3,
    `got ${dup}`
  );
  ok("empty run is NaN", Number.isNaN(interpolateLinear([], [], 0)));
}

console.log("# interpolateRun dispatch and knotOrder");
{
  ok(
    "dispatches linear",
    near(interpolateRun([0, 10], [0, 10], 5, "linear"), 5)
  );
  ok(
    "dispatches catmullRom",
    near(interpolateRun([0, 10], [0, 10], 5, "catmullRom"), 5)
  );
  ok("dispatches step", near(interpolateRun([0, 10], [0, 10], 5, "step"), 0));
  ok(
    "sorts an out-of-order run",
    JSON.stringify(knotOrder([1965, 1955, 1960])) === JSON.stringify([1, 2, 0])
  );
}

console.log("# interpolate(rows): step reads the previous keyframe's row");
{
  const rows = [
    { year: 1955, country: "A", life: 50, note: "early" },
    { year: 1960, country: "A", life: 60, note: "late" },
  ];
  const [stepped] = interpolate(rows, {
    along: "year",
    key: "country",
    at: 1957.5,
    method: "step",
  });
  ok("holds the numeric field", near(stepped.life as number, 50));
  // Non-numeric fields follow the method: at 1957.5 the NEAREST keyframe is a
  // tie that resolves to 1955 anyway, so push the playhead past the midpoint,
  // where nearest and previous genuinely disagree.
  const [late] = interpolate(rows, {
    along: "year",
    key: "country",
    at: 1959,
    method: "step",
  });
  ok("copies the previous keyframe's text", late.note === "early");
  const [smooth] = interpolate(rows, {
    along: "year",
    key: "country",
    at: 1959,
  });
  ok("the default still blends", near(smooth.life as number, 58));
  ok("and copies the nearest keyframe's text", smooth.note === "late");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
