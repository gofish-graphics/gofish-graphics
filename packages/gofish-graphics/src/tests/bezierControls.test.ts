/**
 * `Curve.bezier({ controls })`: control points relative to the chord, and
 * the default (no `controls`) unchanged.
 *
 * Run: `npx tsx src/tests/bezierControls.test.ts`.
 */
import { resolveCurve } from "../ast/graphicalOperators/routers";
import { bezier } from "../families/curve";

declare const process: { exit(code: number): never };

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

/** A zero-size box at a point. */
const at = (x: number, y: number) => [
  { min: x, max: x, size: 0 },
  { min: y, max: y, size: 0 },
];
const route = (curve: ReturnType<typeof bezier>, a: number[], b: number[], dir: 0 | 1 = 0) => {
  const { router, options } = resolveCurve(curve);
  return router(at(a[0], a[1]) as any, at(b[0], b[1]) as any, { dir, opts: options });
};
const near = (p: number[], q: number[]) =>
  Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;

console.log("# default: the d3 link convention, unchanged");
{
  const [seg] = route(bezier(), [0, 0], [100, 40]) as any[];
  ok(
    "both controls at the main-axis midpoint, each at its end's cross value",
    near(seg.control1, [50, 0]) && near(seg.control2, [50, 40]),
    JSON.stringify(seg)
  );
  const [v] = route(bezier(), [0, 0], [100, 40], 1) as any[];
  ok(
    "dir y: the midpoint is on y",
    near(v.control1, [0, 20]) && near(v.control2, [100, 20]),
    JSON.stringify(v)
  );
}

console.log("# controls: [t, h] relative to the chord");
{
  const [seg] = route(bezier({ controls: [[0.25, 0.5], [0.75, 0.5]] }), [0, 100], [200, 100]) as any[];
  // Chord left to right, length 200: h = 0.5 is 100 px to the left of
  // travel, which on screen (y down) is up, -y.
  ok(
    "a left-to-right chord: controls a quarter and three quarters along, lifted up (screen -y)",
    near(seg.start, [0, 100]) &&
      near(seg.control1, [50, 0]) &&
      near(seg.control2, [150, 0]) &&
      near(seg.end, [200, 100]),
    JSON.stringify(seg)
  );
  const [back] = route(bezier({ controls: [[0.25, 0.5], [0.75, 0.5]] }), [200, 100], [0, 100]) as any[];
  ok(
    "a right-to-left chord: left of travel is down (screen +y)",
    near(back.control1, [150, 200]) && near(back.control2, [50, 200]),
    JSON.stringify(back)
  );
  const [diag] = route(bezier({ controls: [[0, 0], [1, -1]] }), [0, 0], [30, 40]) as any[];
  // Left normal of (30, 40) scaled by the chord: (40, -30); h = -1 is the
  // opposite side, (-40, 30).
  ok(
    "a diagonal chord: h is in chord lengths along the left normal",
    near(diag.control1, [0, 0]) && near(diag.control2, [30 - 40, 40 + 30]),
    JSON.stringify(diag)
  );
}

console.log("# exactly two control points");
for (const bad of [[[0.5, 0.5]], [[0, 0], [0.5, 0.5], [1, 0]], [[0, 0], [1]]]) {
  let message = "no error";
  try {
    route({ kind: "bezier", controls: bad } as any, [0, 0], [1, 0]);
  } catch (e) {
    message = String((e as Error).message);
  }
  ok(
    `${JSON.stringify(bad)} is a loud error`,
    message.includes("exactly two") && message.includes("[t, h]"),
    message
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
