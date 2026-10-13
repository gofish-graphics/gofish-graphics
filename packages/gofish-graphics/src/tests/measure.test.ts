/**
 * Units as gradual types with inference (#955; `measure.ts`).
 *
 * A column with no declared unit has an unknown unit, a unit variable named
 * by its quantity (the column, or the source column of a `bin()` edge),
 * which unifies with anything. A declared unit (`Schema.unit`, the
 * "instant" of `Schema.time()`, the "count" of `.count()`) is concrete, and
 * two different declared units on one axis are a `MeasureClash`. A binding
 * holds for the whole render. The quantity names title the axis; a declared
 * unit never does.
 *
 * The first part pins the channel contract (a column's quantity reaches mark
 * channels over split leaves, #534) and the unifier itself, from source. The
 * second renders charts from `dist` (for the same lodash-ESM reason as
 * `axisDims.test.ts`). Run: `pnpm build && tsx src/tests/measure.test.ts`
 * (wired as `pnpm test:measure`).
 */
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { getQuantity } from "../ast/data";
import { columnType, copyColumnTypes, setColumnTypes } from "../ast/schema";
import { inferSize, resolveQuantity } from "../ast/channels";
import {
  columnQuantity,
  MeasureClash,
  resolveUnit,
  sameUnit,
  Units,
  withUnits,
} from "../ast/measure";
import {
  CONTINUOUS,
  joinUnits,
  quantityUnits,
  type UnitRecord,
} from "../ast/underlyingSpace";
import { distributeSpaceFold } from "../ast/constraints/distribute";
import { interval } from "../util/interval";

const {
  chart,
  derive,
  scatter,
  spread,
  rect,
  layer,
  field,
  bin,
  ribbon,
  line,
  Schema,
} = GoFish as any;

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

/** The message of the error `fn` throws (or rejects with), or undefined. */
async function errorOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

const SIZE = { w: 300, h: 200 };
const textsOf = (dl: any): string[] => {
  const out: string[] = [];
  const walk = (it: any) => {
    if (it.kind === "text") out.push(String(it.text));
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

// ── Channels: a column's quantity reaches mark channels (#534) ──────────────

// A bin()-shaped array: `size` is an amount of the source column's quantity.
const mm = { HasUnit: { quantity: "Beak Length (mm)" } };
const binned = setColumnTypes(
  [
    { start: 0, end: 10, size: 10, count: 3 },
    { start: 10, end: 20, size: 10, count: 7 },
  ],
  { start: mm, end: mm, size: mm }
);

console.log("# measure: quantities on the source array");
{
  ok(
    "inferSize on the whole binned array tags the source quantity",
    getQuantity(inferSize("size", binned))?.name === "Beak Length (mm)"
  );
  const rawLeaf = [...binned].slice(0, 1);
  ok("an untagged split leaf has no type", columnType(rawLeaf, "size") === undefined);
  ok(
    "and falls back to the column's own name",
    getQuantity(inferSize("size", rawLeaf))?.name === "size"
  );
  const leaf = copyColumnTypes([...binned].slice(0, 1), binned);
  ok(
    "copyColumnTypes restores the source quantity",
    resolveQuantity(leaf, "size")?.name === "Beak Length (mm)"
  );
  ok(
    "a bare column has no declared unit",
    resolveQuantity([{ v: 1 }], "v")?.unit === undefined
  );
  ok(
    "a time column's unit is an instant",
    columnQuantity("start", { HasCalendar: { zone: "UTC" } }).unit === "instant"
  );
  ok(
    "Schema.unit declares the unit",
    columnQuantity("gross", Schema.unit("USD").type).unit === "USD"
  );
}

// ── The join table (joinUnits), both columns ────────────────────────────────

console.log("# measure: the join table, shared axis");
{
  const site = { axis: 1 as const, where: "in a test" };
  /** Run `f` in a fresh render's union-find. */
  const fresh = <T>(f: () => T): T => withUnits(new Units(), f);
  const declared = (name: string, unit: string) =>
    quantityUnits({ name, unit });
  const unknown = (name: string) => quantityUnits({ name });
  const unitOf = (r: UnitRecord | undefined) =>
    r?.unit === undefined ? undefined : resolveUnit(r.unit);
  const clashes = (f: () => unknown): boolean => {
    try {
      f();
      return false;
    } catch (e) {
      return e instanceof MeasureClash;
    }
  };

  fresh(() => {
    const r = joinUnits(declared("a", "USD"), declared("b", "USD"), true, site);
    ok(
      "declared A, declared A: one unit A",
      unitOf(r)?.kind === "declared" && unitOf(r)?.name === "USD"
    );
  });
  fresh(() =>
    ok(
      "declared A, declared B: a MeasureClash (until #528)",
      clashes(() =>
        joinUnits(declared("a", "USD"), declared("b", "EUR"), true, site)
      )
    )
  );
  fresh(() => {
    const x = unknown("x");
    joinUnits(declared("a", "USD"), x, true, site);
    ok(
      "declared A, unknown x: x is bound to A",
      unitOf(x)?.kind === "declared" && unitOf(x)?.name === "USD"
    );
  });
  fresh(() => {
    const r = joinUnits(unknown("x"), unknown("x"), true, site);
    ok(
      "unknown x, unknown x: one unit",
      unitOf(r)?.kind === "unknown" && r!.titles.join() === "x"
    );
  });
  fresh(() => {
    const x = unknown("x");
    const y = unknown("y");
    const r = joinUnits(x, y, true, site);
    ok(
      "unknown x, unknown y: x and y unify",
      sameUnit(unitOf(x), unitOf(y)) && unitOf(r)?.kind === "unknown"
    );
    ok(
      "and the titles are both names, in order",
      r!.titles.join("|") === "x|y"
    );
  });
  fresh(() => {
    // The binding holds for the whole render: "lo" meets USD on one axis,
    // then "count" on another.
    joinUnits(unknown("lo"), declared("price", "USD"), true, site);
    ok(
      "one unknown bound to two declared units: a MeasureClash",
      clashes(() =>
        joinUnits(unknown("lo"), declared("count", "count"), true, {
          axis: 0,
          where: "elsewhere",
        })
      )
    );
  });
  fresh(() =>
    ok(
      "a stack whose parts have two declared units: a MeasureClash",
      clashes(() =>
        distributeSpaceFold(
          [
            CONTINUOUS(interval(0, 1), "free", declared("n", "count")),
            CONTINUOUS(interval(0, 2), "free", declared("len", "mm")),
          ],
          ["p", "q"],
          {
            axis: 1,
            spacing: 0,
            anchor: "edge",
            glue: true,
            origin: { part: 0, fraction: 0, mirrored: false },
          }
        )
      )
    )
  );
}

console.log("# measure: the join table, not shared");
{
  const site = { axis: 1 as const, where: "in a test" };
  const fresh = <T>(f: () => T): T => withUnits(new Units(), f);
  const declared = (name: string, unit: string) =>
    quantityUnits({ name, unit });
  const unknown = (name: string) => quantityUnits({ name });
  const unitOf = (r: UnitRecord | undefined) =>
    r?.unit === undefined ? undefined : resolveUnit(r.unit);

  fresh(() => {
    const a = declared("a", "USD");
    const b = declared("b", "USD");
    joinUnits(a, b, false, site);
    ok(
      "declared A, declared A: one unit A",
      sameUnit(unitOf(a), unitOf(b)) && unitOf(a)?.name === "USD"
    );
  });
  fresh(() => {
    const a = declared("a", "USD");
    const b = declared("b", "EUR");
    let r: UnitRecord | undefined;
    let err: unknown;
    try {
      r = joinUnits(a, b, false, site);
    } catch (e) {
      err = e;
    }
    ok(
      "declared A, declared B: two separate units, no error",
      err === undefined && !sameUnit(unitOf(a), unitOf(b))
    );
    ok("and the join keeps a's record", unitOf(r)?.name === "USD");
  });
  fresh(() => {
    const x = unknown("x");
    joinUnits(declared("a", "USD"), x, false, site);
    ok(
      "declared A, unknown x: forget (x stays unknown)",
      unitOf(x)?.kind === "unknown"
    );
  });
  fresh(() => {
    const a = unknown("x");
    const b = unknown("x");
    joinUnits(a, b, false, site);
    ok("unknown x, unknown x: one unit", sameUnit(unitOf(a), unitOf(b)));
  });
  fresh(() => {
    const x = unknown("x");
    const y = unknown("y");
    joinUnits(x, y, false, site);
    ok(
      "unknown x, unknown y: forget (two units)",
      !sameUnit(unitOf(x), unitOf(y))
    );
  });
}

// ── Rendering: the benchmark failures now render with no annotation ─────────

const penguins = [
  170, 175, 181, 186, 190, 193, 195, 197, 200, 210, 215, 220, 230,
].map((f, i) => ({ id: i, flipper: f, mass: 3000 + f * 5, sp: i % 2 ? "A" : "B" }));
const myBins = (rows: any[]) =>
  [170, 190, 210].map((s) => ({
    start: s,
    end: s + 20,
    count: rows.filter((r) => r.flipper >= s && r.flipper < s + 20).length,
  }));
const flows = [
  { label: "a", amount: 10 },
  { label: "b", amount: -4 },
  { label: "c", amount: 6 },
];
const totals = (rows: any[]) => {
  let t = 0;
  return rows.map((d) => {
    const lo = t;
    t += d.amount;
    return { label: d.label, lo: Math.min(lo, t), hi: Math.max(lo, t) };
  });
};
const bal = [
  { t: 0, balance: 3 },
  { t: 1, balance: -2 },
  { t: 2, balance: 1 },
];

const renders: [string, () => any][] = [
  [
    "histogram: derive(user bins), xMin start / xMax end",
    () =>
      chart(penguins)
        .flow(derive(myBins), scatter({ xMin: "start", xMax: "end" }))
        .mark(rect({ h: "count" })),
  ],
  [
    "bullet: a layer of rects w good / w average",
    () =>
      chart([{ category: "Rev", good: 300, average: 250, sales: 270 }])
        .flow(spread({ by: "category", dir: "y" }))
        .mark(
          layer([
            rect({ w: "good", h: 30 }),
            rect({ w: "average", h: 30 }),
            rect({ w: "sales", h: 10 }),
          ])
        ),
  ],
  [
    "dendrogram: xMin x1 / xMax x2",
    () =>
      chart([
        { id: "a", x1: 0, x2: 1, y1: 2, y2: 2 },
        { id: "b", x1: 0, x2: 0, y1: 0, y2: 2 },
      ])
        .flow(
          scatter({ by: "id", xMin: "x1", xMax: "x2", yMin: "y1", yMax: "y2" })
        )
        .mark(rect({})),
  ],
  [
    "waterfall: yMin lo / yMax hi",
    () =>
      chart(flows)
        .flow(
          derive(totals),
          spread({ by: "label", dir: "x" }),
          scatter({ yMin: "lo", yMax: "hi" })
        )
        .mark(rect({})),
  ],
  [
    "surplus-deficit: ribbon h v layered with line y balance",
    () =>
      chart(bal.map((d) => ({ t: d.t, v: d.balance })))
        .flow(scatter({ by: "t", x: "t" }))
        .mark(ribbon({ h: "v" }))
        .layer(
          chart(bal)
            .flow(scatter({ by: "t", x: "t", y: "balance" }))
            .mark(line({}))
        ),
  ],
  [
    "hexbin: x budget layered with x cx",
    () =>
      chart([{ id: 0, budget: 1, gross: 2 }])
        .flow(scatter({ by: "id", x: "budget", y: "gross" }))
        .mark(rect({ w: 1, h: 1 }))
        .layer(
          chart([{ id: 0, cx: 1, cy: 2 }])
            .flow(scatter({ by: "id", x: "cx", y: "cy" }))
            .mark(rect({ w: 1, h: 1 }))
        ),
  ],
  [
    "ridgeline: y temp_c layered with y tx",
    () =>
      chart([
        { month: "Jan", i: 0, temp_c: 2 },
        { month: "Jan", i: 1, temp_c: 5 },
      ])
        .flow(scatter({ by: "i", x: "i", y: "temp_c" }))
        .mark(rect({ w: 2, h: 2 }))
        .layer(
          chart([{ month: "Jan", tx: 3 }])
            .flow(scatter({ by: "month", x: 0, y: "tx" }))
            .mark(rect({ w: 2, h: 2 }))
        ),
  ],
  [
    "gantt: Schema.time start / end, no annotation",
    () =>
      chart(
        [
          { task: "a", start: "2024-01-01", end: "2024-02-01" },
          { task: "b", start: "2024-01-15", end: "2024-03-01" },
        ],
        { schema: { start: Schema.time(), end: Schema.time() } }
      )
        .flow(
          spread({ by: "task", dir: "y" }),
          scatter({ xMin: "start", xMax: "end" })
        )
        .mark(rect({ h: 10 })),
  ],
];

console.log("# measure: charts that clashed before now render");
for (const [name, mk] of renders) {
  const err = await errorOf(() => mk().toDisplayList(SIZE));
  ok(name, err === undefined, err);
}

// ── Rendering: declared units still clash ───────────────────────────────────

console.log("# measure: declared units clash");
{
  const gross = [
    { genre: "a", us: 10, eu: 9 },
    { genre: "b", us: 20, eu: 18 },
  ];
  const usdEur = await errorOf(() =>
    chart(gross, { schema: { us: Schema.unit("USD"), eu: Schema.unit("EUR") } })
      .flow(spread({ by: "genre", dir: "x" }))
      .mark(layer([rect({ h: "us" }), rect({ h: "eu" })]))
      .toDisplayList(SIZE)
  );
  ok(
    "USD vs EUR on one axis is a MeasureClash naming the axis and units",
    usdEur !== undefined &&
      /The y axis combines two different units, "USD"/.test(usdEur) &&
      /"EUR"/.test(usdEur),
    usdEur
  );

  const countMm = await errorOf(() =>
    chart(penguins, { schema: { flipper: Schema.unit("mm") } })
      .flow(spread({ by: "sp", dir: "x" }))
      .mark(
        layer([rect({ h: field("flipper").count() }), rect({ h: "flipper" })])
      )
      .toDisplayList(SIZE)
  );
  ok(
    "count vs a column declared mm on one axis is a MeasureClash",
    countMm !== undefined && /two different units/.test(countMm),
    countMm
  );

  // Chart-wide binding: "lo" meets the USD "price" on chart A's y axis, so
  // "lo" is USD in the whole figure; on chart B's x axis it then meets a
  // count. Chart B alone renders: its "lo" is unknown there.
  const a = () =>
    chart([{ id: "p", lo: 1, price: 5 }], {
      schema: { price: Schema.unit("USD") },
    })
      .flow(spread({ by: "id", dir: "x" }))
      .mark(rect({ y: "lo", y2: "price" }));
  const b = () =>
    chart([
      { k: "u", lo: 2 },
      { k: "v", lo: 3 },
    ])
      .flow(spread({ by: "k", dir: "y" }))
      .mark(layer([rect({ w: "lo", h: 5 }), rect({ w: field("lo").count(), h: 5 })]));
  const alone = await errorOf(() => b().toDisplayList(SIZE));
  ok("chart B alone renders (its lo is unknown)", alone === undefined, alone);
  const wide = await errorOf(() => a().layer(b()).toDisplayList(SIZE));
  ok(
    "a variable bound to USD on one axis then meeting count on another clashes",
    wide !== undefined && /"USD"/.test(wide) && /"count"/.test(wide),
    wide
  );
}

// ── Titles: quantity names, never a declared unit ───────────────────────────

console.log("# measure: titles come from quantity names");
{
  const hist = textsOf(
    await chart(penguins, { axes: true })
      .flow(derive(bin("flipper")), scatter({ xMin: "start", xMax: "end" }))
      .mark(rect({ h: "count" }))
      .toDisplayList(SIZE)
  );
  ok(
    "bin edges title as their source column",
    hist.includes("flipper") && !hist.some((t) => /start|end/.test(t)),
    hist.join(" | ")
  );
  ok("bin counts title as count", hist.includes("count"), hist.join(" | "));

  const declared = textsOf(
    await chart(
      [
        { genre: "a", "Worldwide Gross": 10 },
        { genre: "b", "Worldwide Gross": 20 },
      ],
      { schema: { "Worldwide Gross": Schema.unit("USD") }, axes: true }
    )
      .flow(spread({ by: "genre", dir: "x" }))
      .mark(rect({ h: "Worldwide Gross" }))
      .toDisplayList(SIZE)
  );
  ok(
    "a declared column titles by its name, never its unit",
    declared.includes("Worldwide Gross") && !declared.includes("USD"),
    declared.join(" | ")
  );

  const several = textsOf(
    await chart(flows, { axes: true })
      .flow(
        derive(totals),
        spread({ by: "label", dir: "x" }),
        scatter({ yMin: "lo", yMax: "hi" })
      )
      .mark(rect({}))
      .toDisplayList(SIZE)
  );
  ok(
    "an axis over several names titles them all, joined",
    several.includes("lo, hi"),
    several.join(" | ")
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
