/**
 * Units as gradual types with inference (#955; `measure.ts`).
 *
 * A column with no declared unit has an unknown unit, a unit variable named
 * by its quantity (its declared `name`, else the column; the
 * cells of `field(x).bin(p)` are amounts of `x`), which unifies with
 * anything. A declared unit (`Unit`, or a unit's name, the
 * "instant" of `Unit.time()`, the "count" of `.count()`) is concrete, and
 * two different declared units on one axis are a `MeasureClash`. A binding
 * holds for the whole render. The quantity names title the axis, followed by
 * a declared unit's symbol: "Pay (USD)".
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
import { applyEntryNormalize } from "../ast/fieldExpr";
import {
  columnType,
  columnTypeOf,
  copyColumnTypes,
  setColumnTypes,
  Unit as SrcUnit,
} from "../ast/schema";
import { inferSize, resolveColumn } from "../ast/channels";
import {
  columnQuantity,
  MeasureClash,
  resolveUnit,
  sameUnitVar,
} from "../ast/measure";
import {
  CONTINUOUS,
  joinUnits,
  quantityUnits,
  spaceUnit,
  type CONTINUOUS_TYPE,
  type UnitRecord,
} from "../ast/underlyingSpace";
import { GoFishNode } from "../ast/_node";
import { DatumValueImpl } from "../ast/data";
import { positionNode } from "../ast/graphicalOperators/positionNode";
import {
  DURATION,
  INSTANT,
  Units,
  withUnits,
  type Quantity,
} from "../ast/measure";
import {
  differenceUnits,
  magnitude,
  spaceZone,
} from "../ast/underlyingSpace";
import { declared, fresh, textsOf, unknown } from "./testHelpers";
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
  partition,
  region,
  struct,
  Bin,
  Calendar,
  ribbon,
  line,
  Unit,
  stack,
  treemap,
  normalize,
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

// ── Channels: a column's quantity reaches mark channels (#534) ──────────────

// A histogram-shaped array: `size` is an amount of the source column's
// quantity.
const mm = { HasQuantity: { name: "Beak Length (mm)" } };
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
  ok(
    "an untagged split leaf has no type",
    columnType(rawLeaf, "size") === undefined
  );
  ok(
    "and falls back to the column's own name",
    getQuantity(inferSize("size", rawLeaf))?.name === "size"
  );
  const leaf = copyColumnTypes([...binned].slice(0, 1), binned);
  ok(
    "copyColumnTypes restores the source quantity",
    resolveColumn(leaf, "size").quantity?.name === "Beak Length (mm)"
  );
  ok(
    "a bare column has no declared unit",
    resolveColumn([{ v: 1 }], "v").quantity?.unit === undefined
  );
  ok(
    "a time column's unit is an instant",
    columnQuantity("start", { HasUnit: Unit.time().type }).unit?.unit === "instant"
  );
  ok(
    "and an instant has no symbol",
    columnQuantity("start", { HasUnit: Unit.time().type }).unit?.symbol === undefined
  );
  ok(
    "a Unit declares the unit",
    columnQuantity("gross", columnTypeOf("gross", SrcUnit("USD"))).unit?.unit ===
      "USD"
  );
  ok(
    "and its symbol is the unit's name",
    columnQuantity("gross", columnTypeOf("gross", SrcUnit("USD"))).unit
      ?.symbol === "USD"
  );
  ok(
    "a record's name names the quantity in place of the column",
    columnQuantity("q1", columnTypeOf("q1", { name: "Pay" })).name === "Pay"
  );
  // A column type is a record keyed by class, so compare it with its classes
  // in a fixed order: the order the builders ran in is not part of the type.
  const classes = (t: Record<string, unknown>) =>
    JSON.stringify(Object.entries(t).sort(([a], [b]) => a.localeCompare(b)));
  ok(
    "a record and its key order write the same column type",
    [
      { name: "Pay", unit: SrcUnit("USD") },
      { unit: SrcUnit("USD"), name: "Pay" },
    ]
      .map((s) => classes(columnTypeOf("q1", s)))
      .every(
        (c) =>
          c ===
          classes({
            HasUnit: { unit: "USD", symbol: "USD", classes: {} },
            HasQuantity: { name: "Pay" },
          })
      )
  );
}

// ── The join table (joinUnits), both columns ────────────────────────────────

console.log("# measure: the join table, shared axis");
{
  const site = { axis: 1 as const, where: "in a test" };
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
      unitOf(r)?.kind === "declared" && unitOf(r)?.unit === "USD"
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
      unitOf(x)?.kind === "declared" && unitOf(x)?.unit === "USD"
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
      sameUnitVar(x.unit!, y.unit!) && unitOf(r)?.kind === "unknown"
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
  fresh(() => {
    // A declared unit is a concrete term: it binds no variable of its name.
    declared("value", "USD");
    ok(
      "a declared column leaves an unknown of the same name unknown",
      unitOf(unknown("value"))?.kind === "unknown"
    );
    ok(
      "and two declared columns of one name, USD and EUR, are two units",
      !sameUnitVar(
        declared("value", "USD").unit!,
        declared("value", "EUR").unit!
      )
    );
  });
  ok(
    "reading an unknown unit outside any walk is an internal error",
    /Internal error/.test(
      (() => {
        try {
          unknown("x");
          return "";
        } catch (e) {
          return (e as Error).message;
        }
      })()
    )
  );
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
  const unitOf = (r: UnitRecord | undefined) =>
    r?.unit === undefined ? undefined : resolveUnit(r.unit);

  fresh(() => {
    const a = declared("a", "USD");
    const b = declared("b", "USD");
    joinUnits(a, b, false, site);
    ok(
      "declared A, declared A: one unit A",
      sameUnitVar(a.unit!, b.unit!) && resolveUnit(a.unit!).kind === "declared"
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
      err === undefined && !sameUnitVar(a.unit!, b.unit!)
    );
    ok("and the join keeps a's record", r === a);
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
    ok("unknown x, unknown x: one unit", sameUnitVar(a.unit!, b.unit!));
  });
  fresh(() => {
    const x = unknown("x");
    const y = unknown("y");
    joinUnits(x, y, false, site);
    ok(
      "unknown x, unknown y: forget (two units)",
      !sameUnitVar(x.unit!, y.unit!)
    );
  });
}

// ── A position offset: a point plus a difference ───────────────────────────

console.log("# measure: a position offset joins in difference units");
{
  // A leaf whose y space is pinned (a point) or free (a magnitude) at
  // [0, 10], in the units of quantity `q`, read inside the walk.
  const leaf = (origin: "pinned" | "free", q?: Quantity) =>
    new GoFishNode(
      {
        type: "leaf",
        resolveUnderlyingSpace: () => [
          CONTINUOUS(interval(0, 0), "pinned"),
          CONTINUOUS(interval(0, 10), origin, quantityUnits(q)),
        ],
        layout: () => ({
          intrinsicDims: [{}, {}],
          transform: { translate: [undefined, undefined] },
        }),
      },
      []
    );
  const by = (v: number, q: Quantity) => new DatumValueImpl(v, q);
  const usd: Quantity = {
    name: "price",
    column: "price",
    unit: { unit: "USD", symbol: "USD" },
  };
  const count: Quantity = { name: "n", column: "n", unit: { unit: "count" } };
  const shift: Quantity = { name: "shift", column: "shift" };
  const date: Quantity = {
    name: "date",
    column: "date",
    unit: { ...INSTANT, zone: "UTC" },
  };
  const lag: Quantity = { name: "lag", column: "lag", unit: DURATION };
  const yOf = (node: GoFishNode) =>
    node.resolveUnderlyingSpace()[1] as CONTINUOUS_TYPE;

  const a = yOf(positionNode({ y: by(5, shift) }, [leaf("pinned", usd)]));
  ok(
    "(a) a USD position with an unknown offset is fine and stays USD",
    spaceUnit(a)?.unit?.kind === "declared" &&
      (spaceUnit(a)!.unit as any).unit === "USD" &&
      JSON.stringify(a.dataInterval) === JSON.stringify(interval(5, 15))
  );
  // #1197 review: a USD column that does not add (no `.summable()`) still
  // moves by USD: a difference keeps its unit, with no derived ΔUSD.
  const plainUsd = await errorOf(() =>
    positionNode({ y: by(5, usd) }, [
      leaf("pinned", usd),
    ]).resolveUnderlyingSpace()
  );
  const usdByUsd = yOf(positionNode({ y: by(5, usd) }, [leaf("pinned", usd)]));
  ok(
    "a plain USD position moved by a USD offset is USD, with no clash",
    plainUsd === undefined &&
      (spaceUnit(usdByUsd)!.unit as any).unit === "USD",
    plainUsd
  );
  const b = await errorOf(() =>
    positionNode({ y: by(5, count) }, [
      leaf("pinned", usd),
    ]).resolveUnderlyingSpace()
  );
  ok(
    "(b) a USD position with a count offset is a MeasureClash",
    b !== undefined && /USD/.test(b) && /count/.test(b),
    b
  );
  const c1 = yOf(positionNode({ y: by(5, shift) }, [leaf("pinned", date)]));
  ok(
    "(c) a time position with a numeric offset: the offset is a duration",
    (spaceUnit(c1)!.unit as any).unit === "instant" &&
      spaceZone(c1) === "UTC"
  );
  const c2 = yOf(positionNode({ y: by(5, lag) }, [leaf("pinned", date)]));
  ok(
    "(c) a time position with a duration offset stays on its calendar",
    (spaceUnit(c2)!.unit as any).unit === "instant" &&
      spaceZone(c2) === "UTC"
  );
  const twoTimes = await errorOf(() =>
    positionNode({ y: by(5, date) }, [
      leaf("pinned", date),
    ]).resolveUnderlyingSpace()
  );
  ok("a time does not move a time", twoTimes !== undefined, twoTimes);
  const hung = yOf(positionNode({ y: by(5, date) }, [leaf("free", lag)]));
  ok(
    "a duration hung at a time is a time on its calendar",
    (spaceUnit(hung)!.unit as any).unit === "instant" &&
      spaceZone(hung) === "UTC" &&
      JSON.stringify(hung.measure?.titles) === JSON.stringify(["date", "lag"])
  );
  // Two instants in different zones are one unit, so they unify, and the
  // unit they meet to can read only one calendar.
  let zones: string | undefined;
  try {
    withUnits(new Units(), () =>
      joinUnits(
        quantityUnits(date),
        quantityUnits({
          name: "at",
          column: "at",
          unit: { ...INSTANT, zone: "America/New_York" },
        }),
        true,
        { axis: 1, where: "in a test" }
      )
    );
  } catch (e) {
    zones = (e as Error).message;
  }
  ok(
    "two time zones on one shared axis throw",
    zones ===
      `Two time columns on one axis are read in different time zones, ` +
        `"UTC" and "America/New_York". One axis reads one calendar: give ` +
        `both columns the same zone in Unit.time({ zone }).`,
    zones
  );
}

// ── Rendering: the benchmark failures now render with no annotation ─────────

const penguins = [
  170, 175, 181, 186, 190, 193, 195, 197, 200, 210, 215, 220, 230,
].map((f, i) => ({
  id: i,
  flipper: f,
  mass: 3000 + f * 5,
  sp: i % 2 ? "A" : "B",
}));
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
    "gantt: Unit.time() start / end, no annotation",
    () =>
      chart(
        [
          { task: "a", start: "2024-01-01", end: "2024-02-01" },
          { task: "b", start: "2024-01-15", end: "2024-03-01" },
        ],
        { schema: { start: Unit.time(), end: Unit.time() } }
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
    chart(gross, { schema: { us: Unit("USD").summable(), eu: Unit("EUR").summable() } })
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
    chart(penguins, { schema: { flipper: Unit("mm").summable() } })
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
  ok(
    "its hint declares the column, never the count, in the schema",
    countMm !== undefined &&
      countMm.includes('schema: { "flipper": "count" }') &&
      !countMm.includes('schema: { "count"'),
    countMm
  );

  // The hint names a COLUMN, which is what a schema is keyed by, even when
  // the column declares a quantity of another name.
  const payEur = await errorOf(() =>
    chart(
      [
        { genre: "a", q1: 10, eu: 9 },
        { genre: "b", q1: 20, eu: 18 },
      ],
      {
        schema: {
          q1: { name: "Pay", unit: Unit("USD").summable() },
          eu: Unit("EUR").summable(),
        },
      }
    )
      .flow(spread({ by: "genre", dir: "x" }))
      .mark(layer([rect({ h: "q1" }), rect({ h: "eu" })]))
      .toDisplayList(SIZE)
  );
  ok(
    "a declared quantity's clash hint names its column, not its quantity",
    payEur !== undefined &&
      /"USD" \("Pay"\)/.test(payEur) &&
      payEur.includes('schema: { "q1": "EUR" }') &&
      !payEur.includes('schema: { "Pay"'),
    payEur
  );

  // A declared column is its unit, so two charts that each declare their
  // own "value" share nothing through the column's name. Placed apart (a
  // spread gives each its own slot, so they do not share an axis), each
  // keeps its own unit. Overlaid in a layer they would share y, and two
  // declared units on one shared axis wait on dual axes (#528).
  const values = [
    { genre: "a", value: 1 },
    { genre: "b", value: 2 },
  ];
  const valueIn = (unit: string) =>
    chart(values, { w: 100, h: 100, schema: { value: Unit(unit).summable() } })
      .flow(spread({ by: "genre", dir: "x" }))
      .mark(rect({ h: "value" }));
  const twoValues = await errorOf(() =>
    spread({ dir: "y" }, [valueIn("USD"), valueIn("EUR")]).toDisplayList(SIZE)
  );
  ok(
    "two charts declaring their own column of one name, USD and EUR, render",
    twoValues === undefined,
    twoValues
  );
  const counted = [
    { genre: "a", count: 3, v: 1 },
    { genre: "a", count: 5, v: 2 },
    { genre: "b", count: 4, v: 2 },
  ];
  const peopleCount = await errorOf(() =>
    chart(counted, { schema: { count: Unit("people").summable() } })
      .flow(spread({ by: "genre", dir: "x" }))
      .mark(rect({ h: field("v").count(), w: field("count").sum() }))
      .toDisplayList(SIZE)
  );
  ok(
    'a column "count" declared people next to a .count() renders',
    peopleCount === undefined,
    peopleCount
  );

  // Chart-wide binding: "lo" meets the USD "price" on chart A's y axis, so
  // "lo" is USD in the whole figure; on chart B's x axis it then meets a
  // count. Chart B alone renders: its "lo" is unknown there.
  const a = () =>
    chart([{ id: "p", lo: 1, price: 5 }], {
      schema: { price: Unit("USD") },
    })
      .flow(spread({ by: "id", dir: "x" }))
      .mark(rect({ y: "lo", y2: "price" }));
  const b = () =>
    chart([
      { k: "u", lo: 2 },
      { k: "v", lo: 3 },
    ])
      .flow(spread({ by: "k", dir: "y" }))
      .mark(
        layer([rect({ w: "lo", h: 5 }), rect({ w: field("lo").count(), h: 5 })])
      );
  const alone = await errorOf(() => b().toDisplayList(SIZE));
  ok("chart B alone renders (its lo is unknown)", alone === undefined, alone);
  const wide = await errorOf(() => a().layer(b()).toDisplayList(SIZE));
  ok(
    "a variable bound to USD on one axis then meeting count on another clashes",
    wide !== undefined && /"USD"/.test(wide) && /"count"/.test(wide),
    wide
  );
}

// ── Titles: quantities, then the unit's symbol ──────────────────────────────

console.log("# measure: titles are Quantity (unit)");
{
  /** The texts of a one-bar-per-genre chart over `rows`, its y read by
   *  `mark`, with `schema`. */
  const bars = async (rows: any[], schema: any, mark: any, opts: any = {}) =>
    textsOf(
      await chart(rows, { schema, axes: true, ...opts })
        .flow(spread({ by: "genre", dir: "x" }))
        .mark(mark)
        .toDisplayList(SIZE)
    );
  const gross = [
    { genre: "a", "Production Budget": 10 },
    { genre: "b", "Production Budget": 20 },
  ];

  const plain = await bars(gross, {}, rect({ h: "Production Budget" }));
  ok(
    "a plain column titles by its name",
    plain.includes("Production Budget"),
    plain.join(" | ")
  );

  const usd = await bars(
    gross,
    { "Production Budget": Unit("USD").summable() },
    rect({ h: "Production Budget" })
  );
  ok(
    "a declared unit follows its quantity in parentheses",
    usd.includes("Production Budget (USD)"),
    usd.join(" | ")
  );

  const explicit = await bars(
    gross,
    { "Production Budget": Unit("USD").summable() },
    rect({ h: "Production Budget" }),
    { axes: { y: { title: "Budget" } } }
  );
  ok(
    "an explicit axes title wins",
    explicit.includes("Budget") &&
      !explicit.includes("Production Budget (USD)"),
    explicit.join(" | ")
  );

  const suffixed = await bars(
    [
      { genre: "a", "Flipper Length (mm)": 190 },
      { genre: "b", "Flipper Length (mm)": 210 },
    ],
    { "Flipper Length (mm)": Unit("mm").summable() },
    rect({ h: "Flipper Length (mm)" })
  );
  ok(
    "a name that ends with the symbol is still suffixed: names are not read",
    suffixed.includes("Flipper Length (mm) (mm)"),
    suffixed.join(" | ")
  );

  const declaredQuantity = await bars(
    [
      { genre: "a", "Flipper Length (mm)": 190 },
      { genre: "b", "Flipper Length (mm)": 210 },
    ],
    {
      "Flipper Length (mm)": { name: "Flipper Length", unit: Unit("mm").summable() },
    },
    rect({ h: "Flipper Length (mm)" })
  );
  ok(
    "a declared quantity titles it cleanly",
    declaredQuantity.includes("Flipper Length (mm)") &&
      !declaredQuantity.some((t) => t.includes("(mm) (mm)")),
    declaredQuantity.join(" | ")
  );

  const counted = await bars(
    penguins.map((p) => ({ ...p, genre: p.sp })),
    {},
    rect({ h: field("flipper").count() })
  );
  ok(
    ".count() titles as count, with no unit",
    counted.includes("count") && !counted.some((t) => /\(count\)/.test(t)),
    counted.join(" | ")
  );

  // The cells of `field(x).bin(p)` keep x's type (#1141): a partition places
  // each group across its cell, and the cell's ends are amounts of x's
  // quantity, in x's unit.
  const histOf = (schema: any) =>
    chart(penguins, { schema, axes: true })
      .flow(partition({ by: field("flipper").bin(Bin.step(20)), dir: "x" }))
      .mark(rect({ h: field("flipper").count() }));
  const hist = textsOf(await histOf({}).toDisplayList(SIZE));
  ok(
    "bin cells title as their source column",
    hist.includes("flipper") && !hist.some((t) => /start|end/.test(t)),
    hist.join(" | ")
  );
  ok(
    "bin counts title as count, with no unit",
    hist.includes("count") && !hist.some((t) => /\(count\)/.test(t)),
    hist.join(" | ")
  );

  const mmSchema = {
    flipper: { name: "Flipper Length", unit: Unit("mm") },
    cm: Unit("cm"),
  };
  const histMm = textsOf(await histOf(mmSchema).toDisplayList(SIZE));
  ok(
    "bin cells take the source's declared quantity and unit",
    histMm.includes("Flipper Length (mm)"),
    histMm.join(" | ")
  );
  ok(
    "and their counts stay a count, with no unit",
    histMm.includes("count") && !histMm.some((t) => /\(count\)/.test(t)),
    histMm.join(" | ")
  );

  // Raw x over its own cells: one axis, one title.
  const rawOver = (x: string) =>
    histOf(mmSchema).layer(
      chart(
        penguins.map((p) => ({ ...p, cm: p.flipper / 10 })),
        { schema: mmSchema }
      )
        .flow(scatter({ by: "id", x }))
        .mark(rect({ w: 2, h: 2 }))
    );
  const overlaid = textsOf(await rawOver("flipper").toDisplayList(SIZE));
  ok(
    "bin cells overlaid with their raw column share one axis",
    overlaid.filter((t) => t === "Flipper Length (mm)").length === 1,
    overlaid.join(" | ")
  );
  const cmOverMm = await errorOf(() => rawOver("cm").toDisplayList(SIZE));
  ok(
    "bin cells in mm overlaid with a column in cm are a MeasureClash",
    cmOverMm !== undefined &&
      /two different units/.test(cmOverMm) &&
      /"mm"/.test(cmOverMm) &&
      /"cm"/.test(cmOverMm),
    cmOverMm
  );

  // The cells of a product or a chain of calendar bins are on the time line:
  // their ends are instants of the binned column, titled by its quantity.
  const sales = Array.from({ length: 90 }, (_, i) => ({
    date: Date.UTC(2024, 0, 1) + i * 4 * 86_400_000,
    i,
    price: i * 2,
  }));
  const timeSchema = {
    date: { name: "Sold", unit: Unit.time() },
    price: Unit("USD"),
  };
  const byTime = (by: any, op: any = partition) =>
    chart(sales, { schema: timeSchema, axes: true })
      .flow(op({ by, dir: "x" }))
      .mark(rect({ h: field("date").count() }));
  for (const [name, by] of [
    ["a product", field("date").bin([Calendar.year, Calendar.month])],
    ["a chain", field("date").bin(Calendar.year).bin(Calendar.month)],
  ] as const) {
    const texts = textsOf(await byTime(by).toDisplayList(SIZE));
    ok(
      `the cells of ${name} of calendar bins take the column's quantity`,
      texts.includes("Sold") && texts.includes("2024"),
      texts.join(" | ")
    );
  }
  const instantOverUsd = await errorOf(() =>
    byTime(field("date").bin([Calendar.year, Calendar.month]))
      .layer(
        chart(sales, { schema: timeSchema })
          .flow(scatter({ by: "i", x: "price" }))
          .mark(rect({ w: 2, h: 2 }))
      )
      .toDisplayList(SIZE)
  );
  ok(
    "calendar cells are instants: overlaid with USD they are a MeasureClash",
    instantOverUsd !== undefined &&
      /"instant" \("Sold"\)/.test(instantOverUsd) &&
      /"USD"/.test(instantOverUsd),
    instantOverUsd
  );

  // The parts of a cycle (the month of the year) are categories, not
  // instants: an ordinal axis over them has no unit, and is titled by its
  // column, as every category axis is.
  const parts = textsOf(
    await byTime(field("date").bin(Calendar.month), spread).toDisplayList(SIZE)
  );
  ok(
    "the parts of a cycle are a category axis titled by the column",
    parts.includes("Jan") && parts.includes("date") && !parts.includes("Sold"),
    parts.join(" | ")
  );

  // A cell of the plane reads each axis off its own column.
  const plane = textsOf(
    await chart(penguins, {
      schema: {
        flipper: { name: "Flipper Length", unit: Unit("mm") },
        mass: { name: "Mass", unit: Unit("g") },
      },
      axes: true,
    })
      .flow(
        partition({
          by: struct({ x: "flipper", y: "mass" }).bin(
            Bin.hex({ radius: { x: 10, y: 100 } })
          ),
        })
      )
      .mark(region({ fill: field("flipper").count() }))
      .toDisplayList(SIZE)
  );
  ok(
    "hexagon cells take each axis's column quantity and unit",
    plane.includes("Flipper Length (mm)") && plane.includes("Mass (g)"),
    plane.join(" | ")
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

  // A box plot: four summary columns, one declared quantity and unit.
  const summary = [
    { genre: "a", lo: 1, q1: 3, q3: 6, hi: 9 },
    { genre: "b", lo: 2, q1: 4, q3: 7, hi: 10 },
  ];
  const box = (schema: any) =>
    bars(
      summary,
      schema,
      layer([rect({ y: "lo", y2: "hi" }), rect({ y: "q1", y2: "q3" })])
    );
  const undeclared = await box({});
  ok(
    "a box plot with no declarations titles by its column names",
    undeclared.includes("lo, hi, q1, q3"),
    undeclared.join(" | ")
  );
  const pay = { name: "Pay", unit: Unit("USD") };
  const declaredBox = await box({ lo: pay, q1: pay, q3: pay, hi: pay });
  ok(
    "one declared quantity over four columns titles once, with its unit",
    declaredBox.includes("Pay (USD)"),
    declaredBox.join(" | ")
  );
  // #998: a split with no `by` hands each mark `[row]`, tagged with the
  // column types like any other leaf, so the declaration reaches it.
  const noByBox = textsOf(
    await chart(summary, {
      schema: { lo: pay, q1: pay, q3: pay, hi: pay },
      axes: true,
    })
      .flow(spread({ dir: "x" }))
      .mark(layer([rect({ y: "lo", y2: "hi" }), rect({ y: "q1", y2: "q3" })]))
      .toDisplayList(SIZE)
  );
  ok(
    "a mark under a split with no `by` keeps the declared quantity and unit",
    noByBox.includes("Pay (USD)"),
    noByBox.join(" | ")
  );

  const times = textsOf(
    await chart(
      [
        { day: "2024-03-01", price: 1 },
        { day: "2024-03-09", price: 3 },
      ],
      { schema: { day: Unit.time() }, axes: true }
    )
      .flow(scatter({ x: "day", y: "price" }))
      .mark(rect({ w: 4, h: 4 }))
      .toDisplayList(SIZE)
  );
  ok(
    "a time axis titles by its column, with no (instant)",
    times.includes("day") && !times.some((t) => t.includes("instant")),
    times.join(" | ")
  );
}

// ── CanAdd: only amounts that add up are summed (#1197) ─────────────────────

console.log("# measure: CanAdd");
{
  const sales = [
    { region: "n", product: "a", usd: 10, temp: 20, day: "2024-03-01" },
    { region: "n", product: "b", usd: 5, temp: 22, day: "2024-03-02" },
    { region: "s", product: "a", usd: 7, temp: 25, day: "2024-03-03" },
    { region: "s", product: "a", usd: 3, temp: 26, day: "2024-03-04" },
  ];
  const stacked = (schema: object, mark: unknown) =>
    chart(sales, { schema })
      .flow(spread({ by: "region", dir: "x" }), stack({ by: "product", dir: "y" }))
      .mark(mark)
      .toDisplayList(SIZE);

  const usd = await errorOf(() =>
    stacked({ usd: Unit("USD").summable() }, rect({ h: "usd" }))
  );
  ok("a .summable() USD column stacks and sums", usd === undefined, usd);

  const celsius = await errorOf(() =>
    stacked({ temp: Unit("°C") }, rect({ h: "temp" }))
  );
  ok(
    "stacking a Unit(\"°C\") column throws, naming the column",
    celsius !== undefined &&
      /"temp"/.test(celsius) &&
      /cannot be summed/.test(celsius) &&
      /\.summable\(\)/.test(celsius) &&
      !/subtract a reference/.test(celsius),
    celsius
  );

  // A unit's name alone declares the unit and nothing about what it can do:
  // a sum of it passes, as a sum of an undeclared column does, and its axis
  // still shows the unit.
  const nameOnly = await errorOf(() =>
    stacked({ temp: "°C" }, rect({ h: "temp" }))
  );
  ok("a column in a unit's name alone stacks", nameOnly === undefined, nameOnly);
  const nameOnlyTitle = textsOf(
    await chart(sales, { schema: { temp: "°C" }, axes: true })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: field("temp").mean() }))
      .toDisplayList(SIZE)
  );
  ok(
    "and its axis title shows the unit",
    nameOnlyTitle.includes("temp (°C)"),
    nameOnlyTitle.join(" | ")
  );

  // A column record: its name titles the axis, its unit is a Unit.
  const record = textsOf(
    await chart(sales, {
      schema: { usd: { name: "Revenue", unit: Unit("USD").summable() } },
      axes: true,
    })
      .flow(spread({ by: "region", dir: "x" }), stack({ by: "product", dir: "y" }))
      .mark(rect({ h: "usd" }))
      .toDisplayList(SIZE)
  );
  ok(
    "a column record's name and summable Unit title and stack",
    record.includes("Revenue (USD)"),
    record.join(" | ")
  );
  const unknownKey = await errorOf(() =>
    stacked({ usd: { name: "Revenue", entity: "region" } }, rect({ h: "usd" }))
  );
  ok(
    "a column record with an unknown key throws, naming it",
    unknownKey !== undefined &&
      /column "usd" has the unknown key "entity"/.test(unknownKey) &&
      /takes name and unit/.test(unknownKey),
    unknownKey
  );

  // A name and a definition of one unit are one unit: they share an axis,
  // and the name takes the definition's classes.
  const both = (schema: object, op: unknown) =>
    chart(
      sales.map((d) => ({ ...d, cost: d.usd / 2 })),
      { schema, axes: true }
    )
      .flow(spread({ by: "region", dir: "x" }), op)
      .mark(
        layer([
          rect({ h: field("usd").mean() }),
          rect({ h: field("cost").mean() }),
        ])
      )
      .toDisplayList(SIZE);
  const shared = await errorOf(async () => {
    const texts = textsOf(
      await both(
        { usd: "USD", cost: Unit("USD") },
        spread({ by: "product", dir: "x" })
      )
    );
    if (!texts.includes("usd, cost (USD)")) throw new Error(texts.join(" | "));
  });
  ok(
    "a unit's name and its Unit share one axis, titled once",
    shared === undefined,
    shared
  );
  const takesNot = await errorOf(() =>
    stacked({ usd: "USD", cost: Unit("USD") }, rect({ h: "usd" }))
  );
  ok(
    "a name beside a Unit of that name that is not summable does not stack",
    takesNot !== undefined &&
      /sums the column "usd", in the unit "USD"/.test(takesNot) &&
      /Unit\("USD"\)\.summable\(\)/.test(takesNot),
    takesNot
  );
  const takesSummable = await errorOf(() =>
    stacked({ usd: "USD", cost: Unit("USD").summable() }, rect({ h: "usd" }))
  );
  ok(
    "and beside a summable Unit of that name it stacks",
    takesSummable === undefined,
    takesSummable
  );
  const conflict = await errorOf(() =>
    stacked({ usd: Unit("USD").summable(), cost: Unit("USD") }, rect({ h: "usd" }))
  );
  ok(
    "two Units of one name that disagree on .summable() throw",
    conflict !== undefined &&
      /The column "usd" and the column "cost" are both in the unit "USD"/.test(
        conflict
      ) &&
      /const USD = Unit\("USD"\)\.summable\(\)/.test(conflict),
    conflict
  );
  const sameDef = await errorOf(() => {
    const USD = Unit("USD").summable();
    return stacked({ usd: USD, cost: USD }, rect({ h: "usd" }));
  });
  ok("one Unit shared by two columns stacks", sameDef === undefined, sameDef);

  // One row per bar is still a sum: the check reads the column's type, not
  // how many rows a group holds.
  const oneRow = await errorOf(() =>
    chart(sales.slice(0, 2), { schema: { temp: Unit("°C") } })
      .flow(spread({ by: "product", dir: "x" }))
      .mark(rect({ h: "temp" }))
      .toDisplayList(SIZE)
  );
  ok("a one-row bar of °C throws as well", oneRow !== undefined, oneRow);

  // A mean folds the rows itself, so the size channel adds nothing; but a
  // stack of means adds them, and that is checked at the stack.
  const meanBars = await errorOf(() =>
    chart(sales, { schema: { temp: Unit("°C") } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: field("temp").mean() }))
      .toDisplayList(SIZE)
  );
  ok("a bar of a mean °C sums nothing", meanBars === undefined, meanBars);
  const meanStack = await errorOf(() =>
    stacked({ temp: Unit("°C") }, rect({ h: field("temp").mean() }))
  );
  ok(
    "a stack of mean °C throws at the stack",
    meanStack !== undefined && /^stack sums/.test(meanStack),
    meanStack
  );

  const time = await errorOf(() =>
    stacked({ day: Unit.time() }, rect({ h: "day" }))
  );
  ok(
    "a Unit.time() column as a size throws, suggesting a difference",
    time !== undefined &&
      /"day"/.test(time) &&
      /in the unit "instant", which cannot be summed/.test(time) &&
      /their difference, in "duration", does/.test(time),
    time
  );

  const undeclared = await errorOf(() => stacked({}, rect({ h: "temp" })));
  ok("an undeclared column still stacks", undeclared === undefined, undeclared);

  const sum = await errorOf(() =>
    chart(sales, { schema: { temp: Unit("°C") } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: field("temp").sum() }))
      .toDisplayList(SIZE)
  );
  ok(
    "field(...).sum() of °C throws",
    sum !== undefined && /field\(\.\.\.\)\.sum\(\)/.test(sum),
    sum
  );

  const tree = await errorOf(() =>
    chart(sales, { schema: { temp: Unit("°C") } })
      .flow(treemap({ by: "region", size: field("temp").mean() }))
      .mark(rect({}))
      .toDisplayList(SIZE)
  );
  ok(
    "a treemap of mean °C throws",
    tree !== undefined && /treemap/.test(tree),
    tree
  );

  // The `normalize(rows, field)` data helper adds the column, so it checks
  // it as `field(...).normalize()` does.
  const normalized = (schema: object, column: string) => {
    let seen: any[] = [];
    return errorOf(async () => {
      await chart(sales, { schema })
        .flow(
          derive((rows: any[]) => (seen = normalize(rows, column))),
          spread({ by: "region", dir: "x" })
        )
        .mark(rect({ h: field(column).mean() }))
        .toDisplayList(SIZE);
    }).then((e) => ({ e, seen }));
  };
  const normCelsius = await normalized({ temp: Unit("°C") }, "temp");
  ok(
    "normalize(rows, field) of °C throws, naming the column",
    normCelsius.e !== undefined &&
      /^normalize\(\.\.\.\) sums the column "temp"/.test(normCelsius.e),
    normCelsius.e
  );
  const normUsd = await normalized({ usd: Unit("USD").summable() }, "usd");
  ok(
    "normalize(rows, field) of a summable USD column divides by the total",
    normUsd.e === undefined &&
      JSON.stringify(normUsd.seen.map((r) => r.usd)) ===
        JSON.stringify([10 / 25, 5 / 25, 7 / 25, 3 / 25]),
    normUsd.e ?? JSON.stringify(normUsd.seen)
  );

  // A window's shares: a NaN entry makes the total NaN, so every share is 0
  // with a warning, never a NaN share beside valid ones.
  const shares = (xs: number[]) =>
    applyEntryNormalize(xs.map((datum) => ({ type: "datum", datum }) as any))
      .map((v: any) => v.datum);
  const warn = console.warn;
  let warned = 0;
  console.warn = () => void warned++;
  const nanShares = shares([1, NaN, 3]);
  console.warn = warn;
  ok(
    "a NaN entry in a normalize window makes every share 0, with a warning",
    JSON.stringify(nanShares) === "[0,0,0]" && warned === 1,
    JSON.stringify(nanShares)
  );
  ok(
    "and a window of numbers shares its total",
    JSON.stringify(shares([1, 3])) === "[0.25,0.75]",
    JSON.stringify(shares([1, 3]))
  );

  // Every `.sum()` is checked, wherever it is read: a label's and a color's
  // as well as a size's.
  const labelSum = await errorOf(() =>
    chart(sales, { schema: { temp: Unit("°C") } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: "usd" }).label(field("temp").sum()))
      .toDisplayList(SIZE)
  );
  ok(
    "a label of field(...).sum() of °C throws",
    labelSum !== undefined && /field\(\.\.\.\)\.sum\(\)/.test(labelSum),
    labelSum
  );
  const colorSum = await errorOf(() =>
    chart(sales, { schema: { temp: Unit("°C") } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: "usd", fill: field("temp").sum() }))
      .toDisplayList(SIZE)
  );
  ok(
    "a color of field(...).sum() of °C throws",
    colorSum !== undefined && /field\(\.\.\.\)\.sum\(\)/.test(colorSum),
    colorSum
  );
  const labelMean = await errorOf(() =>
    chart(sales, { schema: { temp: Unit("°C") } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: "usd" }).label(field("temp").mean()))
      .toDisplayList(SIZE)
  );
  ok("a label of a mean °C sums nothing", labelMean === undefined, labelMean);

  // A cut's slices are parts of a whole, so its sizes must add up.
  const cutOf = (schema: object) =>
    chart(sales, { schema })
      .flow(spread({ dir: "y" }))
      .mark(rect({ w: 100, h: 80 }).cut({ dir: "x", size: "temp" }))
      .toDisplayList(SIZE);
  const cutCelsius = await errorOf(() =>
    cutOf({ temp: Unit("°C") })
  );
  ok(
    "cut({ size }) of °C throws, naming the column",
    cutCelsius !== undefined &&
      /"temp"/.test(cutCelsius) &&
      /cannot be summed/.test(cutCelsius),
    cutCelsius
  );
  const cutSummable = await errorOf(() =>
    cutOf({ temp: Unit("°C").summable() })
  );
  ok("cut({ size }) of a .summable() unit cuts", cutSummable === undefined, cutSummable);

  const spans = await errorOf(() =>
    chart(
      [
        { task: "a", start: "2024-03-01", end: "2024-03-05" },
        { task: "b", start: "2024-03-03", end: "2024-03-09" },
      ],
      { schema: { start: Unit.time(), end: Unit.time() } }
    )
      .flow(spread({ by: "task", dir: "y" }))
      .mark(rect({ x: "start", x2: "end", h: 10 }))
      .toDisplayList(SIZE)
  );
  ok("x/x2 spans of instants still render", spans === undefined, spans);

  // A difference keeps its unit: °C − °C is in °C. A unit that names its
  // difference unit (the instant names a duration) has that one, on no
  // calendar, and so do its summands.
  const celsiusRecord = withUnits(new Units(), () => {
    const r = quantityUnits({
      name: "temp",
      column: "temp",
      unit: { unit: "°C", symbol: "°C" },
    })!;
    return { r, d: differenceUnits(r) };
  });
  ok(
    "a °C record's difference units are the record, in °C",
    celsiusRecord.d === celsiusRecord.r
  );
  const timeDiff = withUnits(new Units(), () => {
    const r = differenceUnits(
      quantityUnits({
        name: "day",
        column: "day",
        unit: { ...INSTANT, zone: "UTC" },
      })!
    );
    return { unit: resolveUnit(r.unit!), r };
  });
  ok(
    "an instant's difference units are its difference unit, a duration, on no calendar",
    timeDiff.unit.kind === "declared" &&
      timeDiff.unit.unit === DURATION.unit &&
      timeDiff.unit.zone === undefined &&
      timeDiff.r.summands?.length === 1 &&
      timeDiff.r.summands[0].unit?.unit === DURATION.unit
  );

  // A stack checks only the columns it adds (#1197 review): a stack on one
  // axis of a `start` point in days and a `width` in days. The parts join
  // into one class of "day", but the stack adds only the free part, the
  // width. `start` names its unit only, so it takes the width's classes.
  const dayPart = (rows: any[]) =>
    (rows[0].start !== undefined
      ? rect({ x: "start", w: 1, h: 10 })
      : rect({ w: "width", h: 10 }))(rows);
  const dayStack = (rows: object[], width: unknown) =>
    chart(rows, { schema: { start: "day", width } })
      .flow(stack({ by: "id", dir: "x" }))
      .mark(dayPart)
      .toDisplayList(SIZE);
  const point = { id: "a", start: 10 };
  const span = { id: "b", width: 3 };
  const summableDay = Unit("day").summable();
  const pointFirst = await errorOf(() => dayStack([point, span], summableDay));
  const spanFirst = await errorOf(() => dayStack([span, point], summableDay));
  ok(
    "a day point stacked with a .summable() day width renders, in both orders",
    pointFirst === undefined && spanFirst === undefined,
    pointFirst ?? spanFirst
  );
  const plainWidth = await errorOf(() =>
    dayStack([point, span], Unit("day"))
  );
  ok(
    "a stacked day width that does not add throws, naming only its column",
    plainWidth !== undefined &&
      /sums the column "width"/.test(plainWidth) &&
      !/"start"/.test(plainWidth),
    plainWidth
  );

  // A size is never read on a calendar: a mean of times as a bar's height
  // is a duration (main's behavior), not a bar on a time axis from 1970.
  const meanTime = withUnits(new Units(), () => {
    const space = magnitude(
      new DatumValueImpl(5, {
        name: "day",
        column: "day",
        unit: { ...INSTANT, zone: "UTC" },
      })
    );
    return { unit: resolveUnit(space.measure!.unit!), space };
  });
  ok(
    "a magnitude read from a time is a duration on no calendar",
    meanTime.unit.kind === "declared" &&
      meanTime.unit.unit === DURATION.unit &&
      spaceZone(meanTime.space) === undefined
  );
  const meanBar = await errorOf(async () => {
    const dl = await chart(
      sales.map((d) => ({ ...d, day: `${d.day}T00:00:00Z` })),
      { schema: { day: Unit.time() } }
    )
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: field("day").mean() }))
      .toDisplayList(SIZE);
    const years = textsOf(dl).filter((t) => /19[67]\d/.test(t));
    if (years.length > 0) throw new Error(`calendar ticks: ${years}`);
  });
  ok(
    "rect({ h: field(time).mean() }) renders with no calendar axis",
    meanBar === undefined,
    meanBar
  );

  // CanAdd is a class of the unit, not of the column.
  const columnCanAdd = await errorOf(() =>
    chart(sales, { schema: { usd: { CanAdd: {} } } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: "usd" }))
      .toDisplayList(SIZE)
  );
  ok(
    "a column-level CanAdd is not a column class, and throws",
    columnCanAdd !== undefined && /unknown key "CanAdd"/.test(columnCanAdd),
    columnCanAdd
  );
  const wire = await errorOf(() =>
    chart(sales, {
      schema: { usd: { HasUnit: { unit: "USD", classes: { CanAdd: {} } } } },
    })
      .flow(spread({ by: "region", dir: "x" }), stack({ by: "product", dir: "y" }))
      .mark(rect({ h: "usd" }))
      .toDisplayList(SIZE)
  );
  ok("the wire form HasUnit.classes.CanAdd sums", wire === undefined, wire);

  // A unit is its name across the whole figure: two charts that share an
  // axis meet their occurrences of "USD" in the type walk. Chart `defines`
  // defines USD without CanAdd (its bars are means, which sum nothing);
  // chart `names` names USD only, and stacks it.
  const ledger = sales.map((d) => ({ ...d, cost: d.usd / 2 }));
  const defines = (unit: unknown) =>
    chart(ledger, { schema: { cost: unit } })
      .flow(spread({ by: "region", dir: "x" }))
      .mark(rect({ h: field("cost").mean() }));
  const names = () =>
    chart(ledger, { schema: { usd: "USD" } })
      .flow(spread({ by: "region", dir: "x" }), stack({ by: "product", dir: "y" }))
      .mark(rect({ h: "usd" }));
  const nameFirst = await errorOf(() =>
    layer([names(), defines(Unit("USD"))]).toDisplayList(SIZE)
  );
  const defFirst = await errorOf(() =>
    layer([defines(Unit("USD")), names()]).toDisplayList(SIZE)
  );
  ok(
    "a stack of \"USD\" beside another chart's Unit(\"USD\") throws, in both orders",
    [nameFirst, defFirst].every(
      (e) =>
        e !== undefined &&
        /^stack sums the column "usd", in the unit "USD"/.test(e) &&
        /Unit\("USD"\)\.summable\(\)/.test(e)
    ),
    nameFirst ?? defFirst
  );
  const crossSummable = await errorOf(() =>
    layer([names(), defines(Unit("USD").summable())]).toDisplayList(SIZE)
  );
  ok(
    "and beside another chart's Unit(\"USD\").summable() it stacks",
    crossSummable === undefined,
    crossSummable
  );
  const crossConflict = await errorOf(() =>
    layer([
      defines(Unit("USD").summable()),
      chart(ledger, { schema: { usd: Unit("USD") } })
        .flow(spread({ by: "region", dir: "x" }))
        .mark(rect({ h: field("usd").mean() })),
    ]).toDisplayList(SIZE)
  );
  ok(
    "two charts whose Units of one name disagree throw, naming both columns",
    crossConflict !== undefined &&
      /The column "cost" and the column "usd" are both in the unit "USD"/.test(
        crossConflict
      ),
    crossConflict
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
