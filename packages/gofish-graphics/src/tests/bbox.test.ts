/**
 * Unit tests for the per-axis linear-system bbox ledger (#39).
 * Run: `tsx src/tests/bbox.test.ts` (wired into `pnpm test` as `test:bbox`).
 *
 * The bbox is a 2-unknown system in (min, size): each facet (min/max/center/
 * size) is one equation; two independent facets are rank 2 and determine the
 * rest; a third dependent write is checked for consistency. These tests pin that
 * contract so the ledger can be grown into the node's authoritative dimension
 * state without silent behavior drift.
 */

import { BBox } from "../ast/constraints/bbox";
import * as Monotonic from "../util/monotonic";
import { localAnchorPoint } from "../ast/dims";

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

console.log("# bbox: under-determined (rank < 2)");
{
  const b = new BBox();
  ok("empty: all facets undefined", b.read("min") === undefined && !b.solved);
  b.add("min", 10);
  ok("rank 1: pinned facet readable", b.read("min") === 10);
  ok("rank 1: other facets undefined", b.read("size") === undefined && !b.solved);
}

console.log("# bbox: rank 2 solves every facet");
{
  // min + max → size, center
  const b = new BBox();
  b.add("min", 10);
  b.add("max", 30);
  ok(
    "min+max ⇒ size=20, center=20, solved",
    b.solved && near(b.read("size"), 20) && near(b.read("center"), 20)
  );
}
{
  // min + size → max, center
  const b = new BBox();
  b.add("min", 10);
  b.add("size", 20);
  ok(
    "min+size ⇒ max=30, center=20",
    near(b.read("max"), 30) && near(b.read("center"), 20)
  );
}
{
  // center + size → min, max  (the case place()-by-center + a size would hit)
  const b = new BBox();
  b.add("center", 20);
  b.add("size", 20);
  ok(
    "center+size ⇒ min=10, max=30",
    near(b.read("min"), 10) && near(b.read("max"), 30)
  );
}
{
  // max + center → min, size
  const b = new BBox();
  b.add("max", 30);
  b.add("center", 20);
  ok(
    "max+center ⇒ min=10, size=20",
    near(b.read("min"), 10) && near(b.read("size"), 20)
  );
}
{
  // zero-width span: min == max ⇒ size 0 (the degenerate but valid case)
  const b = new BBox();
  b.add("min", 10);
  b.add("max", 10);
  ok("min==max ⇒ size 0", b.solved && near(b.read("size"), 0));
}

console.log("# bbox: ownership / over-determination");
{
  // A consistent repeat of an already-pinned facet is absorbed (no conflict).
  const b = new BBox();
  ok("first min: no conflict", b.add("min", 10, "a") === undefined);
  ok("repeat min same value: no conflict", b.add("min", 10, "b") === undefined);
}
{
  // A contradicting second write to the SAME facet (still rank 1) is a conflict.
  const b = new BBox();
  b.add("min", 10, "a");
  const c = b.add("min", 99, "b");
  ok(
    "conflicting same-facet write reports owners",
    c !== undefined && c.facet === "min" && c.owner === "b" && c.priorOwner === "a"
  );
}
{
  // Rank-2 over-determination: a 3rd facet that disagrees with the solve.
  const b = new BBox();
  b.add("min", 10, "a");
  b.add("max", 30, "a"); // size now implied = 20
  const c = b.add("size", 99, "c"); // contradicts implied 20
  ok(
    "rank-2 over-determination reports asserted vs implied",
    c !== undefined &&
      c.facet === "size" &&
      near(c.asserted, 99) &&
      near(c.implied, 20)
  );
}
{
  // Rank-2 over-determination that AGREES is absorbed (no conflict).
  const b = new BBox();
  b.add("min", 10);
  b.add("max", 30); // size implied = 20, center implied = 20
  ok("consistent 3rd facet absorbed", b.add("center", 20) === undefined);
}

console.log("# bbox: σ-affine (Monotonic) facets");
{
  // A σ-valued size + a numeric min → max = min + count·σ (a bar's edge).
  const b = new BBox();
  b.add("min", 100); // a pinned pixel position (constant)
  b.add("size", Monotonic.linear(10, 0)); // 10·σ
  const max = b.readMono("max");
  ok(
    "numeric min + σ size ⇒ σ-affine max",
    max !== undefined && near(max.run(0), 100) && near(max.run(1), 110)
  );
  // read() evaluates at σ: at σ=2 the box top is 100 + 10·2 = 120.
  ok("read(max, σ=2) evaluates", near(b.read("max", 2), 120));
  // center = min + size/2 = 100 + 5σ.
  ok("center is σ-affine", near(b.read("center", 2), 110));
}
{
  // A consistent σ-valued 3rd facet is absorbed; a contradicting one conflicts.
  const b = new BBox();
  b.add("min", 0);
  b.add("max", Monotonic.linear(10, 0)); // size now implied = 10σ
  ok(
    "consistent σ 3rd facet absorbed",
    b.add("size", Monotonic.linear(10, 0)) === undefined
  );
  const c = b.add("size", Monotonic.linear(20, 0)); // 20σ ≠ 10σ
  ok(
    "contradicting σ facet reports conflict",
    c !== undefined && c.facet === "size"
  );
}
{
  // A constant facet still reads back as a plain number via read() (default σ=0).
  const b = new BBox();
  b.add("min", 10);
  b.add("size", 20);
  ok("constant facets read as numbers", b.read("max") === 30);
}

// `place()` and `setExtent`'s rank-1 pin both place an anchor through
// `localAnchorPoint`, which DERIVES center/max from (min, size) rather than
// reading a separately-stored facet. This is what lets an asymmetric box (a
// stored center ≠ min + size/2, as `position.tsx` can build) place identically
// through both paths — the #39 stage-2 fix the earlier place()→setExtent reroute
// got wrong by reading the stored center. On box [min=2, size=10]: center=7,
// max=12, regardless of any stale stored facet.
console.log("# localAnchorPoint: center/max are DERIVED from (min, size)");
{
  ok("min anchor", localAnchorPoint("min", 2, 10) === 2);
  ok("center anchor = min + size/2", localAnchorPoint("center", 2, 10) === 7);
  ok("max anchor = min + size", localAnchorPoint("max", 2, 10) === 12);
  ok("baseline anchor = local origin 0", localAnchorPoint("baseline", 2, 10) === 0);
  // The translate `place(value, anchor)` writes is `value − localAnchorPoint`;
  // pinning center=50 on this box yields 50 − 7 = 43 (never 50 − a stored center).
  ok("center pin translate = value − derived center", 50 - localAnchorPoint("center", 2, 10) === 43);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
