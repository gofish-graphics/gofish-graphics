/**
 * Coordinate-space scale confluence (#618).
 *
 * A coord is the single σ-scale-root for its subtree: it sums the data-driven
 * extents and fits them to its budget, propagating ONE σ down through whatever
 * nesting of distributes sits below. So the per-leaf angular allocation must NOT
 * depend on how the children are GROUPED — a flat distribute of N data-driven
 * wedges must produce the same leaf sizes as any nested grouping of the same N
 * wedges. (This is the confluence the scale-root scoping gate in
 * `buildChildScalePlan` buys; without it a nested group silently re-derives a
 * smaller σ against its equal-slice budget.)
 *
 * Run via `tsx`.
 */
import { coord } from "../ast/coordinateTransforms/coord";
import { polar } from "../ast/coordinateTransforms/polar";
import { Rect } from "../ast/shapes/rect";
import { value } from "../ast/data";
import { layer as Layer } from "../ast/graphicalOperators/layer";
import { Constraint } from "../ast/constraints";

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

// A wedge with a data-driven angular weight (`w` = θ under polar) and a fixed
// radial band. emX/emY make both dims coordinate-space extents.
const wedge = (weight = 1) =>
  Rect({ w: value(weight), h: 40, emX: true, emY: true });
const staticWedge = (radians: number) =>
  Rect({ w: radians, h: 40, emX: true, emY: true });

// Wrap children in a distribute (the `Layer + Constraint.distribute` shape the
// gotree `combine`/`distribute` helpers emit).
const dist = (cs: any[]) => {
  const named = cs.map((c, i) => Layer([c]).name(`__d-${i}`));
  return Layer(named).constrain((c: any) => [
    Constraint.distribute(
      { dir: "x", spacing: 0, mode: "edge", order: "forward" },
      named.map((_: any, i: number) => c[`__d-${i}`])
    ),
  ]);
};

// Lay a coord(polar) subtree out and read each leaf rect's resolved angular
// extent (intrinsicDims[0].size, in radians of coord space).
async function leafThetaSizes(child: any): Promise<number[]> {
  const root: any = await coord({ transform: polar() }, [child]);
  root.resolveAliases();
  root.resolveUnderlyingSpace();
  root.resolveEmbedding();
  root.layout([400, 400], [undefined, undefined], [undefined, undefined]);
  const out: number[] = [];
  const walk = (n: any) => {
    if (n.type === "rect") out.push(n.intrinsicDims?.[0]?.size ?? NaN);
    (n.children ?? []).forEach(walk);
  };
  walk(root);
  return out;
}

const TAU = 2 * Math.PI;
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sameMultiset = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => approx(v, sb[i]));
};

console.log("# coord confluence: flat ≡ nested for data-driven children");
{
  // 4 unit wedges: flat vs (1 + group of 3). Both must give four 90° leaves.
  const flat = await leafThetaSizes(dist([wedge(), wedge(), wedge(), wedge()]));
  const nested = await leafThetaSizes(
    dist([wedge(), dist([wedge(), wedge(), wedge()])])
  );
  ok(
    "flat 4 wedges → four equal 90° leaves summing to 2π",
    flat.length === 4 &&
      flat.every((s) => approx(s, TAU / 4)) &&
      approx(
        flat.reduce((a, b) => a + b, 0),
        TAU
      )
  );
  ok(
    "nested (1 + group of 3) gives the SAME four leaves as flat",
    sameMultiset(flat, nested)
  );

  // Deeper / asymmetric nesting of the same 4 unit wedges — still identical.
  const deep = await leafThetaSizes(
    dist([dist([wedge(), wedge()]), dist([wedge(), wedge()])])
  );
  ok("balanced 2+2 nesting gives the same leaves", sameMultiset(flat, deep));
  const skew = await leafThetaSizes(
    dist([wedge(), dist([wedge(), dist([wedge(), wedge()])])])
  );
  ok("skewed deep nesting gives the same leaves", sameMultiset(flat, skew));
}

console.log("# coord confluence: weighted data-driven children");
{
  // Weights 1,2,3 → budget split 1/6, 2/6, 3/6 of 2π regardless of grouping.
  const flat = await leafThetaSizes(dist([wedge(1), wedge(2), wedge(3)]));
  const nested = await leafThetaSizes(dist([wedge(1), dist([wedge(2), wedge(3)])]));
  ok(
    "weighted flat → 60°/120°/180° summing to 2π",
    sameMultiset(flat, [TAU / 6, TAU / 3, TAU / 2]) &&
      approx(
        flat.reduce((a, b) => a + b, 0),
        TAU
      )
  );
  ok("weighted nested matches weighted flat", sameMultiset(flat, nested));
}

console.log("# coord confluence: mixed data-driven + static children");
{
  // A static wedge fixed at 60° plus two unit data wedges. The data wedges share
  // the remaining budget; nesting the two data wedges must not change anything.
  const fixed = TAU / 6; // 60°
  const flat = await leafThetaSizes(
    dist([staticWedge(fixed), wedge(), wedge()])
  );
  const nested = await leafThetaSizes(
    dist([staticWedge(fixed), dist([wedge(), wedge()])])
  );
  ok(
    "mixed: static stays fixed, data wedges share the rest (flat)",
    flat.length === 3 &&
      flat.filter((s) => approx(s, fixed)).length === 1,
    JSON.stringify(flat)
  );
  ok(
    "mixed: nesting the data wedges is confluent with flat",
    sameMultiset(flat, nested),
    `flat=${JSON.stringify(flat)} nested=${JSON.stringify(nested)}`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
