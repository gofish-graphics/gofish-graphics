/**
 * Unit tests for `labelAngle: "auto"`: the generic whole-chart choice
 * (`src/ast/choice/choose.ts`), the label collision score
 * (`src/ast/axes/autoLabelAngle.ts`), and the option's validation. Run:
 * `tsx src/tests/autoLabelAngle.test.ts` (wired into `pnpm test` as
 * `test:auto-label-angle`).
 *
 * The contract: candidates run in preference order (0°, 45°, 90°) and the
 * first whose labels do not collide wins; if all collide, the one with the
 * least overlap wins, ties going to the more preferred angle.
 */
// The library first, so its modules initialize in their usual order.
import { chart, spread, rect } from "../lib";
import { chooseFirstFit, compareScores, type Score } from "../ast/choice/choose";
import {
  AUTO_LABEL_ANGLES,
  labelsFit,
  scoreAxisLabels,
  type LabelBox,
} from "../ast/axes/autoLabelAngle";
import { resolveAxisLabelAngles, runLayout } from "../ast/gofish";
import { Rect } from "../ast/shapes/rect";

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

// --- chooseFirstFit --------------------------------------------------------

console.log("chooseFirstFit");
{
  const ran: string[] = [];
  const scores: Record<string, Score> = { a: [3, 1], b: [0, 0], c: [0, 0] };
  const res = await chooseFirstFit(
    ["a", "b", "c"],
    async (c) => (ran.push(c), c),
    (c) => scores[c]
  );
  ok("returns the first candidate that fits", res.candidate === "b");
  ok("stops at the first fit", ran.join() === "a,b", ran.join());
}
{
  const scores: Record<string, Score> = { a: [5, 2], b: [2, 9], c: [2, 1] };
  const res = await chooseFirstFit(
    ["a", "b", "c"],
    async (c) => c,
    (c) => scores[c]
  );
  ok("falls back to the lexicographic minimum", res.candidate === "c");
}
{
  const res = await chooseFirstFit(
    ["a", "b"],
    async (c) => c,
    () => [4, 4]
  );
  ok("breaks a fallback tie by preference order", res.candidate === "a");
}
{
  const res = await chooseFirstFit(
    ["a", "b"],
    async (c) => c,
    (c) => (c === "a" ? [0, 1] : [0, 0]),
    (s) => s[1] === 0
  );
  ok("honors an explicit fit test", res.candidate === "b");
}
ok("compareScores orders lexicographically", compareScores([1, 5], [2, 0]) < 0);

// --- label score -----------------------------------------------------------

// A row of `n` labels of width `w` and height 10 whose origins sit `pitch`
// apart along x, turned by `angle` (counterclockwise, like Text's `rotate`)
// about their start baseline.
const row = (n: number, w: number, pitch: number, angle: number): LabelBox[] =>
  Array.from({ length: n }, (_, i) => ({
    dim: 0 as const,
    tier: 0,
    pivot: [i * pitch, 0] as [number, number],
    rotate: angle,
    rel: { minX: 0, maxX: w, minY: -3, maxY: 7 },
  }));

console.log("scoreAxisLabels");
ok(
  "separated labels score zero",
  scoreAxisLabels(row(4, 20, 30, 0), 0).join() === "0,0"
);
{
  const s = scoreAxisLabels(row(3, 20, 15, 0), 0);
  ok("overlapping labels count area and pairs", s[0] === 100 && s[1] === 2, s.join());
}
{
  const s = scoreAxisLabels(row(2, 20, 21, 0), 0);
  ok("a 1px gap is a collision with no area", s[0] === 0 && s[1] === 1, s.join());
}
{
  // Slanted parallel labels: their axis-aligned boxes overlap, but the
  // labels themselves do not (perpendicular clearance 30·sin45 ≈ 21 > 10).
  const s = scoreAxisLabels(row(4, 60, 30, -45), 0);
  ok("parallel slanted labels are compared in their own frame", s.join() === "0,0", s.join());
}
{
  const boxes = [...row(3, 20, 15, 0), ...row(3, 20, 15, 0).map((b) => ({ ...b, dim: 1 as const }))];
  const s = scoreAxisLabels(boxes, 0);
  ok("scores only the requested axis", s[0] === 100 && s[1] === 2, s.join());
}
{
  const a = row(2, 20, 30, 0);
  const b = row(2, 20, 30, 0).map((x) => ({ ...x, tier: 1, pivot: [x.pivot[0] + 15, 0] as [number, number] }));
  const s = scoreAxisLabels([...a, ...b], 0);
  ok("tiers are scored separately", s.join() === "0,0", s.join());
}

// --- choosing an angle on synthetic label geometry ---------------------------

// A labels-only "chart": `n` labels of width `w` at band pitch `pitch`, turned
// to the candidate angle. The angle Text receives is counterclockwise; the
// screen-clockwise user angle is its negation.
const pick = async (w: number, pitch: number, n = 6) =>
  (
    await chooseFirstFit(
      AUTO_LABEL_ANGLES,
      async (a) => row(n, w, pitch, -a),
      (boxes) => scoreAxisLabels(boxes, 0),
      labelsFit
    )
  ).candidate;

console.log("choosing an angle");
ok("0° fits → 0°", (await pick(20, 30)) === 0);
ok("0° collides, 45° fits → 45°", (await pick(60, 20)) === 45);
ok("only 90° fits → 90°", (await pick(60, 13)) === 90);
{
  const first = await pick(60, 4);
  const again = await pick(60, 4);
  ok("all collide → the least overlap (90°), deterministically", first === 90 && again === 90, String(first));
}

// --- validation --------------------------------------------------------------

const errorOf = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

console.log("validation");
ok(
  '"auto" inside a per-tier array is an error',
  (
    await errorOf(() =>
      resolveAxisLabelAngles({ x: { labelAngle: ["auto"] as any } })
    )
  ).includes("per-tier array")
);
ok(
  "an unknown string is an error",
  (
    await errorOf(() =>
      resolveAxisLabelAngles({ x: { labelAngle: "sideways" as any } })
    )
  ).includes("unknown value")
);
ok(
  '"auto" and numbers pass through',
  resolveAxisLabelAngles({ x: { labelAngle: "auto" }, y: { labelAngle: [45, 0] } }).join("|") ===
    "auto|45,0"
);
ok(
  '"auto" on a prebuilt node is an error',
  (
    await errorOf(() =>
      runLayout(
        { w: 100, h: 100, axes: { x: { labelAngle: "auto" } } },
        Rect({ w: 10, h: 10 })
      )
    )
  ).includes("rebuildable")
);

// --- end to end through a chart builder -------------------------------------

// Grouped bars with long inner labels, as in the BarAxesPermutations stories.
// The builder rebuilds the chart for each candidate; the winner's layout is
// what gets lowered, so its label rotation shows the selected angle.
const regionProduct = ["Laptops", "Smartphones", "Accessories", "Wearables"]
  .flatMap((product, i) =>
    ["North", "South", "West"].map((region, j) => ({
      region,
      product,
      sales: 30 + ((i * 17 + j * 11) % 40),
    }))
  );
const selectedAngle = async (w: number): Promise<number[]> => {
  const doc = await chart(regionProduct, { axes: { x: { labelAngle: "auto" } } })
    .flow(
      spread({ by: "region", dir: "x", spacing: 24 }),
      spread({ by: "product", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "sales", fill: "product" }))
    .toDisplayList({ w, h: 210, legend: false });
  const angles = new Set<number>();
  const walk = (it: any) => {
    if (it.kind === "text" && it.text === "Laptops") angles.add(it.rotate ?? 0);
    (it.children ?? []).forEach(walk);
  };
  doc.items.forEach(walk);
  return [...angles];
};

console.log("end to end");
{
  const wide = await selectedAngle(900);
  ok("a wide chart keeps its labels upright", wide.join() === "0", wide.join());
  const narrow = await selectedAngle(220);
  ok(
    "a narrow chart turns every Laptops label to one nonzero angle",
    narrow.length === 1 && narrow[0] !== 0,
    narrow.join()
  );
  // A continuous axis: stacked tick labels never collide, so they stay upright.
  const doc = await chart(regionProduct, { axes: { y: { labelAngle: "auto" } } })
    .flow(spread({ by: "region", dir: "x" }), spread({ by: "product", dir: "x" }))
    .mark(rect({ h: "sales" }))
    .toDisplayList({ w: 300, h: 210 });
  const ticks: number[] = [];
  const walk = (it: any) => {
    if (it.kind === "text" && /^\d+$/.test(it.text)) ticks.push(it.rotate ?? 0);
    (it.children ?? []).forEach(walk);
  };
  doc.items.forEach(walk);
  ok(
    "a continuous axis accepts auto (upright ticks)",
    ticks.length > 0 && ticks.every((a) => a === 0),
    ticks.join()
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
