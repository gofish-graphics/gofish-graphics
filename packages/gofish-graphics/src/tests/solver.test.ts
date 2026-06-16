/**
 * Phase-0 validation of the σ-affine layout solver (#39 endgame).
 * Run: `tsx src/tests/solver.test.ts` (wired into `pnpm test` as `test:solver`).
 *
 * Proves the affine model reproduces the geometry the current engine targets, on
 * six paper cases, and pins the two theses the whole refactor rests on:
 *   - baseline = the σ-INDEPENDENT intercept (the unique scale-free alignment);
 *   - σ = the slope, resolved once per scope from the frame equation.
 * These are analytic ground truths (the geometry a bar/stack/scatter must have);
 * Phase 2 adds the live cross-story shadow assertion against the real engine.
 */
import * as M from "../util/monotonic";
import { SolverBox, AxisScope } from "../ast/solver";

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
const near = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1e-9;
/** size = magnitude·σ (a data-driven extent). */
const dataSize = (magnitude: number) => M.linear(magnitude, 0);

console.log("# solver: SolverBox algebra (unknowns = baseline, size)");
{
  // Upward bar (minCoeff 0): baseline ≡ min. baseline=0, size=80σ at σ=1.
  const b = new SolverBox(0);
  b.add("baseline", 0);
  b.add("size", 80);
  ok("upward: baseline 0 + size 80 ⇒ min=0,max=80,center=40,baseline=0",
    near(b.read("min"), 0) && near(b.read("max"), 80) &&
    near(b.read("center"), 40) && near(b.read("baseline"), 0));
}
{
  // Centered shape (minCoeff -0.5): baseline ≡ center.
  const b = new SolverBox(-0.5);
  b.add("baseline", 100);
  b.add("size", 40);
  ok("centered: baseline 100 + size 40 ⇒ center=100,min=80,max=120",
    near(b.read("center"), 100) && near(b.read("min"), 80) && near(b.read("max"), 120));
}
{
  // Solving from two edges determines a size (what scatter's interval channels need).
  const b = new SolverBox(0);
  b.add("min", 10);
  b.add("max", 30);
  ok("min+max ⇒ size=20, baseline=10 (minCoeff 0)",
    b.solved && near(b.read("size"), 20) && near(b.read("baseline"), 10));
}
{
  // A contradictory third facet is a named conflict, not last-writer-wins.
  const b = new SolverBox(0);
  b.add("baseline", 0);
  b.add("size", 80);
  const conflict = b.add("max", 999);
  ok("over-determination reports a conflict", !!conflict && conflict!.facet === "max");
  const consistent = b.add("max", 80);
  ok("a consistent third facet is absorbed", consistent === undefined);
}

console.log("# solver: case 1 — single bar (σ from the frame)");
{
  const s = new AxisScope();
  s.box("bar").add("baseline", 0); // bottom at 0 (upward)
  s.box("bar").add("size", dataSize(80)); // height = 80·σ
  // Frame: the y-domain max (100) fills the plot height (200) ⇒ σ = 2.
  s.resolveSigma(dataSize(100), 200);
  ok("σ resolved to 2", near(s.sigma, 2));
  ok("bar spans [0,160], size 160", near(s.read("bar", "min"), 0) &&
    near(s.read("bar", "max"), 160) && near(s.read("bar", "size"), 160));
}

console.log("# solver: case 2 — stacked bars (origins chain symbolically in σ)");
{
  const s = new AxisScope();
  const values = [30, 50, 20];
  // bar0 from 0; each next bar's baseline = previous bar's max — emitted as a
  // σ-affine Monotonic BEFORE σ is known, so the chain stays symbolic.
  let prevMax: M.Monotonic = M.linear(0, 0);
  values.forEach((v, i) => {
    const id = `bar${i}`;
    s.box(id).add("baseline", prevMax);
    s.box(id).add("size", dataSize(v));
    prevMax = s.box(id).facetMono("max")!;
  });
  s.resolveSigma(dataSize(100), 200); // sum 100 fills 200 ⇒ σ=2
  ok("bar0 [0,60]", near(s.read("bar0", "min"), 0) && near(s.read("bar0", "max"), 60));
  ok("bar1 [60,160]", near(s.read("bar1", "min"), 60) && near(s.read("bar1", "max"), 160));
  ok("bar2 [160,200]", near(s.read("bar2", "min"), 160) && near(s.read("bar2", "max"), 200));
}

console.log("# solver: case 3 — grouped bars (one shared σ across sub-structures)");
{
  // Two groups of stacked bars share one σ (the same y measure). σ is fixed by
  // the tallest group total (80), not per-group.
  const s = new AxisScope();
  const groups = { A: [30, 50], B: [40, 20] };
  for (const [g, values] of Object.entries(groups)) {
    let prevMax: M.Monotonic = M.linear(0, 0);
    values.forEach((v, i) => {
      const id = `${g}${i}`;
      s.box(id).add("baseline", prevMax);
      s.box(id).add("size", dataSize(v));
      prevMax = s.box(id).facetMono("max")!;
    });
  }
  s.resolveSigma(dataSize(80), 160); // tallest total 80 fills 160 ⇒ σ=2
  ok("shared σ = 2", near(s.sigma, 2));
  ok("group A: [0,60],[60,160]", near(s.read("A0", "max"), 60) && near(s.read("A1", "max"), 160));
  ok("group B: [0,80],[80,120]", near(s.read("B0", "max"), 80) && near(s.read("B1", "max"), 120));
}

console.log("# solver: case 4 — baseline is the unique σ-INDEPENDENT alignment");
{
  // Two upward bars of different data magnitudes (30, 50). Compare aligning their
  // BASELINES vs aligning their MAXes, at two different σ.
  const baselinesEqual = (sigma: number) => {
    const a = new SolverBox(0), b = new SolverBox(0);
    a.add("baseline", 0); a.add("size", dataSize(30));
    b.add("baseline", 0); b.add("size", dataSize(50));
    return near(a.read("baseline", sigma)! - b.read("baseline", sigma)!, 0);
  };
  ok("baseline-align ⇒ equal baselines at σ=1 AND σ=3 (scale-free)",
    baselinesEqual(1) && baselinesEqual(3));

  const baselineGap = (sigma: number) => {
    const T = 500; // common top
    const a = new SolverBox(0), b = new SolverBox(0);
    a.add("max", T); a.add("size", dataSize(30));
    b.add("max", T); b.add("size", dataSize(50));
    return a.read("baseline", sigma)! - b.read("baseline", sigma)!;
  };
  // max-align entangles σ: baselines differ by σ·(50−30) = 20σ.
  ok("max-align ⇒ baselines differ by 20σ (σ-dependent): 20 at σ=1, 60 at σ=3",
    near(baselineGap(1), 20) && near(baselineGap(3), 60));
}

console.log("# solver: case 5 — POSITION scatter (origin=intercept, σ=range/domain)");
{
  const s = new AxisScope();
  // domain [0,100] → screen [0,200]: σ=2, data-0 maps to screen 0 (intercept 0).
  s.resolveSigma(dataSize(100), 200);
  for (const d of [10, 50, 90]) {
    s.box(`p${d}`).add("baseline", M.linear(d, 0)); // position = 0 + σ·d
    s.box(`p${d}`).add("size", 0);
  }
  ok("points map d→σ·d: 10→20, 50→100, 90→180",
    near(s.read("p10", "baseline"), 20) &&
    near(s.read("p50", "baseline"), 100) &&
    near(s.read("p90", "baseline"), 180));
}

console.log("# solver: case 6 — negative bar (intercept sign-invariant)");
{
  // Downward bar (minCoeff -1): baseline is the TOP (local 0); it grows down.
  // The box is σ-independent; σ is supplied at read time below.
  const mk = () => {
    const b = new SolverBox(-1);
    b.add("baseline", 100); // top pinned at 100
    b.add("size", dataSize(40));
    return b;
  };
  const b2 = mk(), b3 = mk();
  ok("σ=2: spans [20,100], baseline(top)=100",
    near(b2.read("min", 2), 20) && near(b2.read("max", 2), 100) && near(b2.read("baseline", 2), 100));
  ok("baseline(=origin) is σ-invariant: 100 at σ=2 and σ=3",
    near(b2.read("baseline", 2), 100) && near(b3.read("baseline", 3), 100));
  ok("the low edge IS σ-dependent: 20 at σ=2, −20 at σ=3",
    near(b2.read("min", 2), 20) && near(b3.read("min", 3), -20));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
