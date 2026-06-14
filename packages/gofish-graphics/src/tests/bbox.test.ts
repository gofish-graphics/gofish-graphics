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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
