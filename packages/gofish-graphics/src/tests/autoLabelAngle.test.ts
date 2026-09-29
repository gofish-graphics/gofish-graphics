/**
 * Unit tests for `labelAngle: "auto"`: the generic whole-chart choice
 * (`src/ast/choice/choose.ts`), the per-row label collision score
 * (`src/ast/axes/autoLabelAngle.ts`), and the option's validation. Run:
 * `tsx src/tests/autoLabelAngle.test.ts` (wired into `pnpm test` as
 * `test:auto-label-angle`).
 *
 * The contract: each label row (axis tier) tries 0°, 45°, 90° in order and
 * keeps the first angle at which its labels do not collide; if all collide,
 * the one with the least overlap wins, ties going to the more preferred angle.
 */
// The library first, so its modules initialize in their usual order.
import { chart, spread, rect } from "../lib";
import {
  chooseFirstFit,
  compareScores,
  type Score,
} from "../ast/choice/choose";
import {
  candidatesFor,
  collectLabelBoxes,
  labelsFit,
  rowScore,
  scoreLabelRows,
  type LabelBox,
} from "../ast/axes/autoLabelAngle";
import type { LabelRowSetting } from "../ast/axes/elaborate";
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
const row = (
  n: number,
  w: number,
  pitch: number,
  angle: number,
  tier = 0,
  kind: "ordinal" | "continuous" = "ordinal"
): LabelBox[] =>
  Array.from({ length: n }, (_, i) => ({
    dim: 0 as const,
    kind,
    tier,
    pivot: [i * pitch, tier * 50] as [number, number],
    rotate: angle,
    rel: { minX: 0, maxX: w, minY: -3, maxY: 7 },
  }));

/** The score of a row, or zero when the row is absent (hidden). */
const scoreOf = (
  boxes: LabelBox[],
  dim: 0 | 1 = 0,
  tier = 0,
  kind: "ordinal" | "continuous" = "ordinal"
): Score => rowScore(scoreLabelRows(boxes), { dim, kind, tier });

console.log("scoreLabelRows");
ok("separated labels score zero", scoreOf(row(4, 20, 30, 0)).join() === "0,0");
{
  const s = scoreOf(row(3, 20, 15, 0));
  ok(
    "overlapping labels count area and pairs",
    s[0] === 100 && s[1] === 2,
    s.join()
  );
}
{
  const s = scoreOf(row(2, 20, 21, 0));
  ok(
    "a 1px gap is a collision with no area",
    s[0] === 0 && s[1] === 1,
    s.join()
  );
}
{
  // Slanted parallel labels: their axis-aligned boxes overlap, but the
  // labels themselves do not (perpendicular clearance 30·sin45 ≈ 21 > 10).
  const s = scoreOf(row(4, 60, 30, -45));
  ok(
    "parallel slanted labels are compared in their own frame",
    s.join() === "0,0",
    s.join()
  );
}
{
  const boxes = [
    ...row(3, 20, 15, 0),
    ...row(3, 20, 30, 0).map((b) => ({ ...b, dim: 1 as const })),
  ];
  ok(
    "axes are scored separately",
    scoreOf(boxes, 0).join() === "100,2" && scoreOf(boxes, 1).join() === "0,0"
  );
}
{
  // Tier 1 sits exactly where tier 0 does, offset half a pitch: were they one
  // row, they would collide.
  const a = row(2, 20, 30, 0);
  const b = row(2, 20, 30, 0).map((x) => ({
    ...x,
    tier: 1,
    pivot: [x.pivot[0] + 15, 0] as [number, number],
  }));
  const s = [...scoreLabelRows([...a, ...b]).values()].map((r) =>
    r.score.join()
  );
  ok(
    "tiers are scored as separate rows",
    s.join("|") === "0,0|0,0",
    s.join("|")
  );
}
{
  // A continuous tick row and an ordinal tier 0 on the same axis are
  // different rows, even though both are tier 0.
  const a = row(2, 20, 30, 0, 0, "continuous");
  const b = row(2, 20, 30, 0, 0, "ordinal").map((x) => ({
    ...x,
    pivot: [x.pivot[0] + 15, 0] as [number, number],
  }));
  ok(
    "kinds are scored as separate rows",
    scoreLabelRows([...a, ...b]).size === 2
  );
}

// --- choosing a setting on synthetic label geometry --------------------------

// A labels-only "chart" with an inner row (tier 0) and an outer row (tier 1),
// both set to the candidate, as a uniform run sets every row. A hidden row
// draws no labels. The angle Text receives is counterclockwise; the
// screen-clockwise user angle is its negation. Each row picks its own setting
// from the same runs.
const pickRows = async (
  inner: [w: number, pitch: number],
  outer: [w: number, pitch: number],
  innerKind: "ordinal" | "continuous" = "ordinal"
): Promise<LabelRowSetting[]> => {
  const draw = (
    c: LabelRowSetting,
    spec: [number, number],
    tier: number,
    kind: "ordinal" | "continuous"
  ) =>
    c === "hidden"
      ? []
      : row(tier === 0 ? 6 : 2, spec[0], spec[1], -(c ?? 0), tier, kind);
  const uniform = async (c: LabelRowSetting) => [
    ...draw(c, inner, 0, innerKind),
    ...draw(c, outer, 1, "ordinal"),
  ];
  const pick = async (tier: number, kind: "ordinal" | "continuous") => {
    const labelRow = { dim: 0 as const, kind, tier };
    return (
      await chooseFirstFit(
        candidatesFor(labelRow),
        uniform,
        (boxes) => scoreOf(boxes, 0, tier, kind),
        labelsFit
      )
    ).candidate;
  };
  return [await pick(0, innerKind), await pick(1, "ordinal")];
};

console.log("choosing a setting per row");
ok("0° fits → 0°", (await pickRows([20, 30], [30, 100])).join() === "0,0");
ok(
  "inner collides at 0°, outer fits → inner 45°, outer 0°",
  (await pickRows([60, 20], [30, 100])).join() === "45,0"
);
ok(
  "inner fits only at 90°, outer fits → inner 90°, outer 0°",
  (await pickRows([60, 13], [30, 100])).join() === "90,0"
);
{
  const first = await pickRows([60, 4], [30, 100]);
  const again = await pickRows([60, 4], [30, 100]);
  ok(
    "a category row colliding at 0°, 45° and 90° is hidden, deterministically",
    first.join() === "hidden,0" && again.join() === "hidden,0",
    first.join()
  );
}
{
  const s = await pickRows([60, 4], [30, 100], "continuous");
  ok(
    "a continuous row is never hidden: it falls back to the least overlap (90°)",
    s.join() === "90,0",
    s.join()
  );
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
  resolveAxisLabelAngles({
    x: { labelAngle: "auto" },
    y: { labelAngle: [45, 0] },
  }).join("|") === "auto|45,0"
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
// what gets lowered, so its label rotation shows the selected angles.
const regionProduct = [
  "Laptops",
  "Smartphones",
  "Accessories",
  "Wearables",
].flatMap((product, i) =>
  ["North", "South", "West"].map((region, j) => ({
    region,
    product,
    sales: 30 + ((i * 17 + j * 11) % 40),
  }))
);
const groupedProducts = () =>
  chart(regionProduct, { axes: { x: { labelAngle: "auto" } } })
    .flow(
      spread({ by: "region", dir: "x", spacing: 24 }),
      spread({ by: "product", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "sales", fill: "product" }));

/** The distinct rotations of the inner (product) and outer (region) rows. */
const rowAngles = async (w: number): Promise<[number[], number[]]> => {
  const doc = await groupedProducts().toDisplayList({
    w,
    h: 210,
    legend: false,
  });
  const inner = new Set<number>();
  const outer = new Set<number>();
  const walk = (it: any) => {
    if (it.kind === "text" && it.text === "Laptops") inner.add(it.rotate ?? 0);
    if (it.kind === "text" && it.text === "North") outer.add(it.rotate ?? 0);
    (it.children ?? []).forEach(walk);
  };
  doc.items.forEach(walk);
  return [[...inner], [...outer]];
};

console.log("end to end");
{
  const [wideIn, wideOut] = await rowAngles(900);
  ok(
    "a wide chart keeps both rows upright",
    wideIn.join() === "0" && wideOut.join() === "0",
    `${wideIn}|${wideOut}`
  );
  const [narrowIn, narrowOut] = await rowAngles(220);
  ok(
    "a narrow chart turns the inner row and leaves the outer row upright",
    narrowIn.length === 1 && narrowIn[0] !== 0 && narrowOut.join() === "0",
    `${narrowIn}|${narrowOut}`
  );
  const [tinyIn, tinyOut] = await rowAngles(90);
  ok(
    "a tiny chart hides the colliding inner row and keeps the outer row upright",
    tinyIn.length === 0 && tinyOut.join() === "0",
    `${tinyIn}|${tinyOut}`
  );

  // The final (combined) run keeps every row collision-free that its uniform
  // run found collision-free: turning the inner row must not make the outer
  // row collide.
  for (const w of [900, 400, 220, 90]) {
    const builder = groupedProducts();
    const node = await builder.resolve();
    node.rebuild = () => builder.resolve();
    const data = await runLayout(
      { w, h: 210, legend: false, axes: { x: { labelAngle: "auto" } } },
      node
    );
    const scores = [
      ...scoreLabelRows(collectLabelBoxes(data.child)).values(),
    ].filter((r) => r.row.dim === 0);
    ok(
      `w=${w}: every row of the chosen layout is collision-free`,
      scores.length > 0 && scores.every((r) => labelsFit(r.score)),
      scores
        .map((r) => `${r.row.dim}:${r.row.tier}=${r.score.join()}`)
        .join(" ")
    );
  }

  // A continuous axis: stacked tick labels never collide, so they stay upright.
  const doc = await chart(regionProduct, {
    axes: { y: { labelAngle: "auto" } },
  })
    .flow(
      spread({ by: "region", dir: "x" }),
      spread({ by: "product", dir: "x" })
    )
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
