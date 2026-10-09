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
import {
  chart,
  spread,
  rect,
  field,
  scatter,
  line,
  Schema,
} from "../lib";
import * as Serialize from "../serialize";
import { inferColor } from "../ast/channels";
import { datum } from "../ast/data";
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

  // Labels that `labelAngle` does not rotate are not scored by "auto": a
  // difference axis's delta labels, and a time axis's row labels.
  {
    const deltaChart = chart([
      { g: "a", v: 10 },
      { g: "b", v: 40 },
      { g: "c", v: 25 },
    ])
      .flow(spread({ by: "g", dir: "x", alignment: "middle" }))
      .mark(rect({ h: "v", w: 20 }));
    const delta = await runLayout(
      { w: 300, h: 200, axes: true },
      await (deltaChart as any).resolve()
    );
    const deltaRows = collectLabelBoxes(delta.child).map(
      (b) => `${b.dim}:${b.kind}`
    );
    ok(
      "a difference axis's delta labels are not scored",
      deltaRows.length === 3 && deltaRows.every((r) => r === "0:ordinal"),
      deltaRows.join(" ")
    );
    const timeChart = chart(
      [
        { date: "2024-01-01", v: 1 },
        { date: "2024-06-01", v: 2 },
      ],
      { schema: { date: Schema.time() } }
    )
      .flow(scatter({ by: "date", x: "date", y: "v" }))
      .mark(line());
    const time = await runLayout(
      { w: 300, h: 200, axes: { x: true, y: false } },
      await (timeChart as any).resolve()
    );
    ok(
      "a time axis's row labels are not scored",
      collectLabelBoxes(time.child).length === 0
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

// --- the unlabeled-categories warning ----------------------------------------

// At w=90 the product row collides at every angle and is hidden. It warns
// unless a rendered legend shows "product" (the color scale records the
// fields it maps).
const warningsOf = async (
  fill: any,
  opts: { legend?: boolean; viaIR?: boolean } = {}
): Promise<string[]> => {
  let builder: any = chart(regionProduct, {
    axes: { x: { labelAngle: "auto" } },
  })
    .flow(
      spread({ by: "region", dir: "x", spacing: 24 }),
      spread({ by: "product", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "sales", fill }));
  if (opts.viaIR) {
    // The Python path: serialize to the frontend IR and rebuild from it.
    const doc = await builder.toJSON();
    builder = Serialize.buildChart(
      doc.root,
      regionProduct,
      undefined,
      Serialize.makeTokenResolver()
    );
  }
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
  try {
    await builder.toDisplayList({
      w: 90,
      h: 210,
      axes: { x: { labelAngle: "auto" } },
      ...(opts.legend === false ? { legend: false } : {}),
    });
  } finally {
    console.warn = warn;
  }
  return warnings.filter((w) => w.includes('labelAngle: "auto"'));
};

console.log("unlabeled-categories warning");
{
  const shown = await warningsOf("product");
  ok(
    "a legend showing the field: no warning",
    shown.length === 0,
    shown.join()
  );
  const suppressed = await warningsOf("product", { legend: false });
  ok(
    "the legend suppressed: warns once, naming the field",
    suppressed.length === 1 &&
      suppressed[0].includes('x-axis "product" labels') &&
      suppressed[0].includes('no legend shows "product"'),
    suppressed.join()
  );
  const other = await warningsOf("region");
  ok("colored by another field: warns", other.length === 1, other.join());
  const fn = await warningsOf((d: any) => d.product);
  ok(
    "colored by a function accessor (no field): warns",
    fn.length === 1,
    fn.join()
  );
  const fieldAccessor = await warningsOf(field("product"));
  ok(
    'colored by field("product"): no warning',
    fieldAccessor.length === 0,
    fieldAccessor.join()
  );
  const ir = await warningsOf("product", { viaIR: true });
  ok(
    "rebuilt from the IR (the Python path): no warning",
    ir.length === 0,
    ir.join()
  );
  const irOther = await warningsOf("region", { viaIR: true });
  ok(
    "rebuilt from the IR, colored by another field: warns",
    irOther.length === 1,
    irOther.join()
  );
}

// --- color field provenance --------------------------------------------------

console.log("color field provenance");
{
  const rows = [{ product: "Laptops" }];
  const named = inferColor("product", rows) as any;
  ok("a field-name color records its field", named?.field === "product");
  ok(
    "field(...) records its field",
    (inferColor(field("product") as any, rows) as any)?.field === "product"
  );
  ok(
    "a function accessor records no field",
    (inferColor((d: any) => d.product, rows) as any)?.field === undefined
  );
  ok(
    "a literal color is not a value",
    inferColor("steelblue", rows) === "steelblue"
  );
  ok(
    "lighten / darken / offset keep the field",
    named.lighten(0.2).field === "product" &&
      named.darken(0.2).field === "product" &&
      named.offset(3).field === "product"
  );
  ok(
    "toJSON writes the field only when present",
    named.toJSON().field === "product" &&
      !("field" in (datum("x") as any).toJSON())
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
