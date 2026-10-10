/**
 * Cells (#1058): `field(x).bin(p)` maps each value to its cell. Covers the
 * cells of each kind of partition, where a value falls, the domain a split
 * bins over (every group sees the chart's cells, empty ones included, #763),
 * the wire form, and the axis over cells (labels between boundary ticks, and
 * a year row over calendar months), and the `partition` operator, which
 * gives each group its cell on a continuous scale: its 1D form, its product
 * form (#1059), and the region each child gets.
 *
 * Run: `pnpm build && tsx src/tests/cells.test.ts` (wired as `pnpm
 * test:cells`). The rendering checks import from `dist`, like time.test.ts.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import "../lib";
import { spawnSync } from "node:child_process";
import { binCells, checkPartition, Cell } from "../ast/cells";
import { mergeCells } from "../ast/underlyingSpace";
import { inferPos } from "../ast/channels";
import { evalFieldValues } from "../ast/fieldExpr";
import { Calendar, loadTemporal } from "../ast/calendar";
import { splitEntries } from "../ast/datumProjection";
import { field } from "../ast/data";
import { partition as srcPartition } from "../lib";
import {
  applySchema,
  copyColumnTypes,
  Schema as SrcSchema,
} from "../ast/schema";

const {
  chart,
  spread,
  stack,
  scatter,
  group,
  table,
  pack,
  treemap,
  partition,
  rect,
  region,
  text,
  circle,
  line,
  selectAll,
  Schema,
} = GoFish as any;
const DistCalendar = (GoFish as any).Calendar;
const distField = (GoFish as any).field;

declare const process: { exit(code: number): never; execPath: string };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function errorOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const edges = (cells: readonly Cell[]) => cells.map((c) => [c.start, c.end]);

async function main() {
  await loadTemporal();

  console.log("\n# numeric partitions");
  {
    const step = binCells({ step: 0.5 }, [1.2, 2.6, 3], undefined, "t");
    check(
      "a step covers the domain with cells aligned to its multiples",
      same(edges(step.cells), [
        [1, 1.5],
        [1.5, 2],
        [2, 2.5],
        [2.5, 3],
        [3, 3.5],
      ]),
      JSON.stringify(edges(step.cells))
    );
    check(
      "a value on a step's boundary is in the cell that starts there",
      step.cellOf(3)?.start === 3 && step.cellOf(2.5)?.start === 2.5
    );
    check(
      "a cell's id is its start, and its label its two edges",
      step.cells[1].id === "1.5" &&
        String(step.cells[1]) === "1.5" &&
        step.cells[1].label === "1.5–2"
    );
    const tenth = binCells({ step: 0.1 }, [0, 0.3], undefined, "t");
    check(
      "edges are rounded multiples of the step",
      same(
        tenth.cells.map((c) => c.start),
        [0, 0.1, 0.2, 0.3]
      ),
      JSON.stringify(tenth.cells.map((c) => c.start))
    );

    const count = binCells({ thresholds: 10 }, [0, 37, 99], undefined, "t");
    check(
      "a count picks a round step from the domain, as axis ticks do",
      count.cells.length === 10 &&
        count.cells[0].start === 0 &&
        count.cells[9].end === 100,
      JSON.stringify(edges(count.cells))
    );
    const closed = binCells({ thresholds: 10 }, [0, 100], undefined, "t");
    check(
      "a thresholds partition puts the domain's top value in the last cell",
      closed.cells.length === 10 && closed.cellOf(100)?.start === 90,
      JSON.stringify(edges(closed.cells))
    );
    const list = binCells(
      { thresholds: [2, 5, 50] },
      [1, 3, 9],
      undefined,
      "t"
    );
    check(
      "explicit edges cut the domain, whose ends are the outer edges",
      same(edges(list.cells), [
        [1, 2],
        [2, 5],
        [5, 9],
      ]) && list.cellOf(9)?.start === 5,
      JSON.stringify(edges(list.cells))
    );
    const formatted = binCells(
      { step: 10, format: (c: Cell) => `${c.start}–${c.end - 1}` },
      [25, 34],
      undefined,
      "t"
    );
    check(
      "a format function writes the labels",
      formatted.cells[0].label === "20–29",
      formatted.cells[0].label
    );
    check(
      "no values, no cells",
      binCells({ step: 1 }, [null, undefined], undefined, "t").cells.length ===
        0
    );
  }

  console.log("\n# calendar partitions");
  {
    const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
    const months = binCells(
      Calendar.month,
      [t("2024-01-15"), t("2024-03-01")],
      "UTC",
      "t"
    );
    check(
      "months over the domain, and March 1 is in March",
      same(
        months.cells.map((c) => c.label),
        ["Jan", "Feb", "Mar"]
      ) && months.cellOf(t("2024-03-01"))?.label === "Mar",
      months.cells.map((c) => c.label).join(" ")
    );
    check(
      "a calendar cell keeps its calendar fields and partition",
      months.cells[1].calendar?.fields.month === 2 &&
        months.cells[1].calendar?.partition === Calendar.month &&
        months.cells[1].end === t("2024-03-01")
    );
    const quarters = binCells(
      Calendar.quarter.format((c) => `Q${c.quarter} ${c.year}`),
      [t("2024-02-01"), t("2024-08-01")],
      "UTC",
      "t"
    );
    check(
      "a Calendar value's format writes the labels",
      same(
        quarters.cells.map((c) => c.label),
        ["Q1 2024", "Q2 2024", "Q3 2024"]
      )
    );
    const err = errorOf(() =>
      binCells(Calendar.month, [1, 2], undefined, 'field("n").bin(...)')
    );
    check(
      "a Calendar partition over a column that is not a time is an error",
      err?.includes("not a time") === true,
      err
    );
  }

  console.log("\n# partitions as written");
  {
    check(
      "the wire forms check",
      checkPartition({ unit: "month", step: 3 }, "t") instanceof Object &&
        same(checkPartition({ step: 2 }, "t"), { step: 2 })
    );
    for (const [name, p] of [
      ["a negative step", { step: -1 }],
      ["a fractional count", { thresholds: 2.5 }],
      ["two partitions", { step: 1, thresholds: 3 }],
      ["a bare number", 10],
    ] as const) {
      check(
        `${name} is an error`,
        errorOf(() => checkPartition(p, "t")) !== undefined
      );
    }
    check(
      "a field expression writes its partition's wire form",
      same(field("d").bin(Calendar.month.every(3)).toJSON().ops, [
        { op: "bin", partition: { unit: "month", step: 3 } },
      ]) &&
        same(field("x").bin({ step: 0.5 }).toJSON().ops, [
          { op: "bin", partition: { step: 0.5 } },
        ])
    );
    const noWire = errorOf(() =>
      JSON.stringify(field("x").bin({ step: 1, format: () => "" }))
    );
    check(
      "a partition with a format has no wire form",
      noWire?.includes("no wire form") === true,
      noWire
    );
  }

  console.log("\n# a split bins over the chart's domain");
  {
    const rows = await applySchema(
      [
        { g: "A", x: 1 },
        { g: "A", x: 2 },
        { g: "B", x: 8 },
      ],
      {}
    );
    // An operator hands each group its rows with the domain they came from
    // (createOperator copies it with the column types).
    const groups = splitEntries("g", rows);
    for (const leaf of groups.values()) copyColumnTypes(leaf, rows);
    const byCell = field("x").bin({ step: 2 });
    const a = splitEntries(byCell, groups.get("A")!);
    const b = splitEntries(byCell, groups.get("B")!);
    check(
      "every group gets the same cells, in order, empty ones kept",
      same([...a.keys()].map(String), ["0", "2", "4", "6", "8"]) &&
        same([...a.keys()], [...b.keys()]),
      `${[...a.keys()].map(String)} / ${[...b.keys()].map(String)}`
    );
    check(
      "the keys are the very same cells in each group",
      [...a.keys()].every((k, i) => k === [...b.keys()][i]) &&
        [...a.keys()].every((k) => k instanceof Cell)
    );
    check(
      "rows land in their cells",
      same(
        [...a.values()].map((r) => r.length),
        [1, 1, 0, 0, 0]
      ) &&
        same(
          [...b.values()].map((r) => r.length),
          [0, 0, 0, 0, 1]
        )
    );
    const sorted = splitEntries(
      field("x").bin({ step: 2 }).reverse(),
      groups.get("A")!
    );
    check(
      "ops after bin reorder the cells",
      same([...sorted.keys()].map(String), ["8", "6", "4", "2", "0"])
    );
    const times = await applySchema(
      [{ d: "2024-01-05" }, { d: "2024-03-20" }],
      { d: SrcSchema.time() }
    );
    check(
      "a time column bins into calendar cells in its zone",
      same(
        [...splitEntries(field("d").bin(Calendar.month), times).keys()].map(
          (c) => (c as Cell).label
        ),
        ["Jan", "Feb", "Mar"]
      )
    );
  }

  console.log("\n# the axis over cells");
  {
    const textsOf = (dl: any): { text: string; x: number; y: number }[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        if (it.kind === "text") out.push(it);
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out;
    };
    const rows = [1.2, 1.4, 2.6, 2.7, 2.8].map((rating) => ({ rating }));
    const dl = await chart(rows, { axes: { x: { title: false }, y: false } })
      .flow(spread({ by: distField("rating").bin({ step: 0.5 }), dir: "x" }))
      .mark(rect({ w: 20, h: distField("rating").count() }))
      .toDisplayList({ w: 300, h: 100 });
    const words = textsOf(dl).map((t) => t.text);
    check(
      "a histogram labels every cell with its edges, the empty one too",
      same(words, ["1–1.5", "1.5–2", "2–2.5", "2.5–3"]),
      words.join(" ")
    );

    const daily = ["2023-11-20", "2023-12-05", "2024-01-10", "2024-03-02"].map(
      (date) => ({ date, value: 1 })
    );
    const monthDl = await chart(daily, {
      schema: { date: Schema.time() },
      axes: { x: { title: false }, y: false },
    })
      .flow(spread({ by: distField("date").bin(DistCalendar.month), dir: "x" }))
      .mark(rect({ w: 30, h: distField("value").sum() }))
      .toDisplayList({ w: 400, h: 100 });
    const texts = textsOf(monthDl);
    const monthWords = texts.map((t) => t.text);
    check(
      "month cells get a month row, with the empty February kept, and a " +
        "year row",
      ["Nov", "Dec", "Jan", "Feb", "Mar", "2023", "2024"].every((w) =>
        monthWords.includes(w)
      ) && monthWords.length === 7,
      monthWords.join(" ")
    );
    const at = (w: string) => texts.find((t) => t.text === w)!;
    check(
      "the year row sits past the month row, each year at its first month",
      at("2023").y > at("Nov").y &&
        at("2024").x > at("Dec").x &&
        at("2024").x <= at("Jan").x,
      JSON.stringify([at("2023"), at("Nov"), at("2024"), at("Jan")])
    );
  }

  console.log("\n# partition");
  {
    const rectsOf = (
      dl: any
    ): { x: number; y: number; w: number; h: number }[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        if (it.kind === "rect") out.push(it);
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out.map((r) => ({
        x: +r.x.toFixed(3),
        y: +r.y.toFixed(3),
        w: +r.w.toFixed(3),
        h: +r.h.toFixed(3),
      }));
    };
    const noAxes = { axes: false };

    // Ratings in [1, 1.5), [1.5, 2) and [2.5, 3): the cell [2, 2.5) is empty.
    const rows = [1.2, 1.4, 1.6, 2.6, 2.7].map((rating) => ({ rating }));
    const hist = rectsOf(
      await chart(rows, noAxes)
        .flow(
          partition({ by: distField("rating").bin({ step: 0.5 }), dir: "x" })
        )
        .mark(rect({ h: distField("rating").count() }))
        .toDisplayList({ w: 400, h: 100 })
    ).filter((r) => r.h > 0);
    const widths = hist.map((r) => r.w);
    check(
      "each bar fills its cell: equal cells give equal widths",
      hist.length === 3 && widths.every((w) => Math.abs(w - widths[0]) < 1e-6),
      JSON.stringify(hist)
    );
    check(
      "the empty cell keeps its place: one cell's width between bars 2 and 3",
      Math.abs(hist[2].x - (hist[1].x + 2 * widths[0])) < 1e-6,
      JSON.stringify(hist)
    );

    const daily = ["2024-02-10", "2024-03-10"].map((date) => ({
      date,
      value: 1,
    }));
    const months = rectsOf(
      await chart(daily, { schema: { date: Schema.time() }, ...noAxes })
        .flow(
          partition({ by: distField("date").bin(DistCalendar.month), dir: "x" })
        )
        .mark(rect({ h: distField("value").sum() }))
        .toDisplayList({ w: 600, h: 100 })
    );
    check(
      "a month is as wide as its days: February (29) to March (31)",
      months.length === 2 &&
        Math.abs(months[0].w / months[1].w - 29 / 31) < 1e-6 &&
        Math.abs(months[0].x + months[0].w - months[1].x) < 1e-6,
      JSON.stringify(months)
    );

    // A stack inside a partition fills its cell, and an empty cell keeps its
    // place rather than collapsing (#1058).
    const regions = [
      { date: "2024-01-10", region: "N", value: 2 },
      { date: "2024-01-10", region: "S", value: 1 },
      { date: "2024-03-10", region: "N", value: 1 },
      { date: "2024-03-10", region: "S", value: 3 },
    ];
    const stacked = rectsOf(
      await chart(regions, { schema: { date: Schema.time() }, ...noAxes })
        .flow(
          partition({
            by: distField("date").bin(DistCalendar.month),
            dir: "x",
          }),
          stack({ by: "region", dir: "y" })
        )
        .mark(rect({ h: distField("value").sum() }))
        .toDisplayList({ w: 910, h: 100 })
    );
    const xs = [...new Set(stacked.map((r) => r.x))].sort((a, b) => a - b);
    const jan = stacked.filter((r) => r.x === xs[0]);
    const mar = stacked.filter((r) => r.x === xs[1]);
    check(
      "a stack in a partition fills its month, and empty February keeps its width",
      jan.length === 2 &&
        mar.length === 2 &&
        jan.every((r) => Math.abs(r.w - jan[0].w) < 1e-6) &&
        Math.abs(jan[0].w / mar[0].w - 1) < 1e-6 &&
        Math.abs(xs[1] - xs[0] - (jan[0].w * (31 + 29)) / 31) < 1e-6,
      JSON.stringify(stacked)
    );

    // Nested 1D partitions give the same regions in either order.
    const pts = [
      { a: 0.5, b: 0.2, name: "a" },
      { a: 0.7, b: 1.7, name: "bbbbbbbb" },
      { a: 2.2, b: 0.4, name: "cc" },
      { a: 1.1, b: 2.9, name: "dddd" },
    ];
    const grid = async (first: "x" | "y") => {
      const px = partition({ by: distField("a").bin({ step: 1 }), dir: "x" });
      const py = partition({ by: distField("b").bin({ step: 1 }), dir: "y" });
      return rectsOf(
        await chart(pts, noAxes)
          .flow(...(first === "x" ? [px, py] : [py, px]))
          .mark(rect({ fill: "steelblue" }))
          .toDisplayList({ w: 300, h: 300 })
      )
        .map((r) => JSON.stringify(r))
        .sort();
    };
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    const xy = await grid("x");
    const yx = await grid("y");
    console.warn = warn;
    check(
      "partition x then y and y then x place the same regions",
      xy.length === 9 && same(xy, yx),
      `${xy.join(" ")}\n      vs ${yx.join(" ")}`
    );
    // The inner partition's cross axis is spanned by its outer cell, so its
    // \`alignment\` there is no constraint at all, not a no-op that warns.
    check(
      "nested partitions leave no align with nothing to move",
      !warnings.some((w) => w.startsWith("[align]")),
      warnings.join("\n")
    );

    // The product form (#1059) is the nested form, x then y, with nothing
    // added. And hand-nested partitions give the same marks in either order,
    // whatever the mark: each child gets the region its outer partition gave
    // its inner one, cut down to its own cell (#1059).
    const itemsOf = (dl: any): any[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        if (it.kind !== "group")
          out.push(
            Object.fromEntries(
              Object.entries(it).filter(
                ([k, v]) =>
                  k !== "id" &&
                  (typeof v === "number" || typeof v === "string")
              )
            )
          );
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out;
    };
    const sorted = (items: any[]) =>
      items.map((it) => JSON.stringify(it)).sort();
    const ab = {
      x: distField("a").bin({ step: 1 }),
      y: distField("b").bin({ step: 1 }),
    };
    const product = async (mark: any) =>
      itemsOf(
        await chart(pts, noAxes)
          .flow(partition({ by: ab }))
          .mark(mark)
          .toDisplayList({ w: 300, h: 300 })
      );
    const nested = async (mark: any, first: "x" | "y") => {
      const px = partition({ by: ab.x, dir: "x" });
      const py = partition({ by: ab.y, dir: "y" });
      return itemsOf(
        await chart(pts, noAxes)
          .flow(...(first === "x" ? [px, py] : [py, px]))
          .mark(mark)
          .toDisplayList({ w: 300, h: 300 })
      );
    };
    for (const [name, mark] of [
      ["region", () => region({ fill: "steelblue" })],
      ["rect", () => rect({ fill: "steelblue" })],
      ["rect with a size", () => rect({ w: 10, h: 20 })],
      ["circle", () => circle({ r: 5 })],
      ["text", () => text({ text: distField("a").count() })],
      // Children of different sizes in one column: each is centered in its
      // own cell, not aligned with the others on their left edges.
      ["texts of different widths", () => text({ text: distField("name") })],
    ] as const) {
      const p = await product(mark());
      const xFirst = await nested(mark(), "x");
      const yFirst = await nested(mark(), "y");
      check(
        `the product form draws what the nested form draws (${name})`,
        p.length > 0 && same(p, xFirst),
        `${JSON.stringify(p)}\n      vs ${JSON.stringify(xFirst)}`
      );
      check(
        `nested partitions draw the same in either order (${name})`,
        xFirst.length > 0 && same(sorted(xFirst), sorted(yFirst)),
        `${sorted(xFirst).join(" ")}\n      vs ${sorted(yFirst).join(" ")}`
      );
    }

    // Each child gets its cell: a region fills it, and a mark with a size of
    // its own sits at its center at that size. The cells are 100px squares.
    const cellRegions = rectsOf(
      await chart(pts, noAxes)
        .flow(partition({ by: ab }))
        .mark(region({ fill: "steelblue" }))
        .toDisplayList({ w: 300, h: 300 })
    );
    const x0 = Math.min(...cellRegions.map((r) => r.x));
    const y0 = Math.min(...cellRegions.map((r) => r.y));
    check(
      "a region fills its cell",
      cellRegions.length === 9 &&
        cellRegions.every(
          (r) =>
            Math.abs(r.w - 100) < 1e-6 &&
            Math.abs(r.h - 100) < 1e-6 &&
            Math.abs((r.x - x0) % 100) < 1e-6 &&
            Math.abs((r.y - y0) % 100) < 1e-6
        ),
      JSON.stringify(cellRegions)
    );
    const circles = (await product(circle({ r: 5 }))).filter(
      (c) => c.kind === "ellipse"
    );
    check(
      "a circle keeps its size and sits at its cell's center",
      circles.length === 9 &&
        circles.every(
          (c) =>
            c.rx === 5 &&
            c.ry === 5 &&
            Math.abs((c.cx - x0 - 50) % 100) < 1e-6 &&
            Math.abs((c.cy - y0 - 50) % 100) < 1e-6
        ),
      JSON.stringify(circles)
    );
    const named = (await product(text({ text: distField("name") }))).filter(
      (t) => t.kind === "text"
    );
    // The first column holds "a", "bbbbbbbb", and an empty cell's "". Their
    // left edges differ, and their centers agree, for any width per letter.
    const column = named.filter((t) => t.x < x0 + 100);
    const leftOf = (word: string) => column.find((t) => t.text === word)?.x;
    const halfLetter = (leftOf("a")! - leftOf("bbbbbbbb")!) / (8 - 1);
    check(
      "texts of different widths in one column each sit at their cell's center",
      column.length === 3 &&
        halfLetter > 0 &&
        column.every(
          (t) => Math.abs(t.x + halfLetter * t.text.length - (x0 + 50)) < 1e-6
        ),
      JSON.stringify(column)
    );
    const fixed1D = rectsOf(
      await chart(pts, noAxes)
        .flow(partition({ by: ab.x, dir: "x" }))
        .mark(rect({ w: 10, h: 10 }))
        .toDisplayList({ w: 300, h: 300 })
    );
    check(
      "in 1D, a mark with a width of its own is centered in its cell",
      fixed1D.length === 3 &&
        fixed1D.every(
          (r, i) =>
            r.w === 10 && Math.abs(r.x - fixed1D[0].x - 100 * i) < 1e-6
        ) &&
        Math.abs(fixed1D[1].x + 5 - (x0 + 150)) < 1e-6,
      JSON.stringify(fixed1D)
    );

    // Empty cells are groups with no rows, as in 1D: each is still given its
    // cell, and a count over it is 0.
    const counts = (await product(text({ text: distField("a").count() })))
      .map((t) => t.text)
      .sort();
    check(
      "an empty cell keeps its place, and a count over it is 0",
      same(counts, ["0", "0", "0", "0", "0", "1", "1", "1", "1"]),
      JSON.stringify(counts)
    );

    const productErr = (opts: any) =>
      errorOf(() => partition(opts)) ?? "no error";
    check(
      "a product key takes exactly x and y, and no dir",
      productErr({ by: { x: ab.x } }).includes("exactly the keys x and y") &&
        productErr({ by: ab, dir: "x" }).includes("divides both axes") &&
        productErr({ by: ab.x }).includes("`dir` names the axis"),
      [
        productErr({ by: { x: ab.x } }),
        productErr({ by: ab, dir: "x" }),
        productErr({ by: ab.x }),
      ].join(" | ")
    );

    const noRegion = await chart(rows)
      .flow(partition({ by: { type: "field", name: "rating" }, dir: "x" }))
      .mark(rect({}))
      .toDisplayList({ w: 100, h: 100 })
      .then(
        () => undefined,
        (e: Error) => e.message
      );
    check(
      "a key with no region is an error that names .bin",
      noRegion !== undefined && noRegion.includes('field("rating").bin('),
      String(noRegion)
    );
  }

  console.log("\n# a group with no rows");
  {
    const walkItems = (dl: any): any[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        out.push(it);
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out;
    };
    // Cells [0, 1) to [4, 5): [1, 2) and [3, 4) hold no rows.
    const pts = [
      { x: 0.5, y: 1 },
      { x: 0.7, y: 2 },
      { x: 2.5, y: 3 },
      { x: 2.7, y: 1 },
      { x: 4.2, y: 2 },
      { x: 4.5, y: 0 },
    ];
    const byCell = () => distField("x").bin({ step: 1 });
    const noAxes = { axes: false };

    const lines = await chart(pts, noAxes)
      .flow(spread({ by: byCell(), dir: "x" }), scatter({ x: "x", y: "y" }))
      .mark(line())
      .toDisplayList({ w: 300, h: 100 })
      .then(
        (dl: any) => walkItems(dl).filter((it) => it.kind === "path").length,
        (e: Error) => e.message
      );
    check(
      "a scatter over an empty cell draws nothing: one line per full cell",
      lines === 3,
      String(lines)
    );

    for (const [name, inner] of [
      ["stack", () => stack({ by: "y", dir: "y" })],
      ["spread", () => spread({ by: "y", dir: "y" })],
      ["group", () => group({ by: "y" })],
      ["scatter", () => scatter({ x: "x", y: "y" })],
      ["table", () => table({ by: { x: "y", y: "y" } })],
      ["pack", () => pack()],
      ["pack by a field", () => pack({ by: "y" })],
      ["treemap", () => treemap({ size: "y" })],
      ["treemap by a field", () => treemap({ by: "y", size: "y" })],
    ] as const) {
      const got = await chart(pts, noAxes)
        .flow(spread({ by: byCell(), dir: "x" }), inner())
        .mark(rect({ w: 5, h: 5 }))
        .toDisplayList({ w: 300, h: 100 })
        .then(
          (dl: any) => walkItems(dl).filter((it) => it.kind === "rect"),
          (e: Error) => e.message
        );
      check(
        `a ${name} over an empty cell draws nothing`,
        Array.isArray(got) &&
          got.length >= pts.length &&
          got.every((r: any) =>
            [r.x, r.y, r.w, r.h].every((v) => Number.isFinite(v))
          ),
        Array.isArray(got) ? JSON.stringify(got.slice(0, 3)) : String(got)
      );
    }

    const emptyPartition = await chart([] as { x: number }[], noAxes)
      .flow(partition({ by: byCell(), dir: "x" }))
      .mark(rect({}))
      .toDisplayList({ w: 300, h: 100 })
      .then(
        (dl: any) => walkItems(dl).filter((it) => it.kind === "rect").length,
        (e: Error) => e.message
      );
    check(
      "a partition over no rows has no cells, and draws nothing",
      emptyPartition === 0,
      String(emptyPartition)
    );

    check(
      "the mean of no rows has no value",
      inferPos("x", []) === undefined &&
        evalFieldValues(field("x").mean(), []).values.length === 0
    );
    const dots = walkItems(
      await chart(pts, noAxes)
        .flow(scatter({ by: byCell(), x: "x", y: "y" }))
        .mark(circle({ r: 3 }))
        .toDisplayList({ w: 300, h: 100 })
    ).filter((it) => it.kind === "ellipse");
    check(
      "a scatter places a group by its rows, so an empty cell is no point " +
        "and leaves the others' scale alone",
      dots.length === 3 &&
        dots.every((d: any) => Number.isFinite(d.cx) && Number.isFinite(d.cy)),
      JSON.stringify(dots.map((d: any) => [d.cx, d.cy]))
    );
  }

  console.log("\n# the default split over cells");
  {
    // Cells [0, 10), [10, 90), [90, 100]: three runs, one per cell.
    const pts = [0, 5, 12, 17, 50, 95, 100].map((x, i) => ({ x, y: i % 3 }));
    const runs = await chart(pts, { axes: false })
      .flow(
        spread({ by: distField("x").bin({ thresholds: [10, 90] }), dir: "x" }),
        scatter({ x: "x", y: "y" })
      )
      .mark(line())
      .toDisplayList({ w: 300, h: 100 })
      .then(
        (dl: any) => {
          const paths: any[] = [];
          const walk = (it: any) => {
            if (it.kind === "path") paths.push(it);
            for (const c of it.children ?? []) walk(c);
          };
          dl.items.forEach(walk);
          return paths.length;
        },
        (e: Error) => e.message
      );
    check(
      "a line keys each mark by the cell its split put it in",
      runs === 3,
      String(runs)
    );
  }

  console.log("\n# a binned key over refs");
  {
    const pts = [0.5, 0.7, 2.5, 2.7, 4.2].map((x) => ({ x, y: 1 }));
    const bars = await chart(pts)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 3 }).name("points"))
      .layer(
        chart(selectAll("points"))
          .flow(spread({ by: distField("x").bin({ step: 2 }), dir: "x" }))
          .mark(rect({ w: 3, h: 3 }))
      )
      .toDisplayList({ w: 300, h: 100 })
      .then(
        (dl: any) => dl.items.filter((it: any) => it.kind === "rect").length,
        (e: Error) => e.message
      );
    check(
      "the cells of a binned key over refs are over the rows they stand for",
      bars === 3,
      String(bars)
    );
  }

  console.log("\n# a domain with no end");
  {
    // In a child process with a time limit, so a loop that never ends fails
    // the check instead of hanging the suite.
    const errorIn = (call: string): string => {
      const cells = new URL("../ast/cells.ts", import.meta.url).href;
      const polygons = new URL("../ast/polygonCells.ts", import.meta.url).href;
      const code =
        `import { binCells } from ${JSON.stringify(cells)};` +
        `import { hexCells } from ${JSON.stringify(polygons)};` +
        `try { ${call}; console.log("no error"); }` +
        `catch (e) { console.log(e.message); }`;
      const run = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", code],
        { timeout: 20000, encoding: "utf8" }
      );
      return run.error !== undefined
        ? `did not finish (${run.error.message})`
        : String(run.stdout).trim();
    };
    for (const [name, call, column] of [
      [
        "a step",
        `binCells({ step: 1 }, [0, Infinity], undefined, 'field("x").bin(...)')`,
        'field("x")',
      ],
      [
        "a threshold count",
        `binCells({ thresholds: 10 }, [-Infinity, 3], undefined, 'field("x").bin(...)')`,
        'field("x")',
      ],
      [
        "hexagons",
        `hexCells({ kind: "hex", radius: 1 }, { x: "a", y: "b" }, [0, 1], [0, Infinity], "t")`,
        'column "b"',
      ],
    ] as const) {
      const message = errorIn(call);
      check(
        `${name} over an infinite value is an error that names the column`,
        message.includes(column) && message.includes("finite"),
        message
      );
    }
  }

  console.log("\n# a union of cells");
  {
    const cell = (start: number, end: number) =>
      new Cell(start, end, `${start}–${end}`);
    const ids = (cells: readonly Cell[] | undefined) =>
      cells === undefined ? "none" : cells.map((c) => c.id).join(" ");
    const sameStep = mergeCells([
      [cell(0, 10), cell(10, 20)],
      [cell(10, 20), cell(20, 30)],
    ]);
    check(
      "the cells of one partition over two domains are one set of cells",
      ids(sameStep) === "0 10 20",
      ids(sameStep)
    );
    const overlapping = mergeCells([
      [cell(0, 10), cell(10, 20)],
      [cell(5, 10), cell(10, 20)],
    ]);
    check(
      "cells of two partitions that overlap are not cells of one",
      overlapping === undefined,
      ids(overlapping)
    );
    const sameStart = mergeCells([[cell(0, 10)], [cell(0, 5)]]);
    check(
      "two cells that start together but end apart are not cells of one",
      sameStart === undefined,
      ids(sameStart)
    );
    const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
    const calendarCells = (p: any, lo: string, hi: string) =>
      binCells(p, [t(lo), t(hi)], "UTC", "t").cells;
    const months = calendarCells(Calendar.month, "2024-01-10", "2024-01-20");
    const days = calendarCells(Calendar.day, "2024-03-04", "2024-03-06");
    const mixed = mergeCells([months, days]);
    check(
      "calendar cells of two partitions are not cells of one, even apart",
      mixed === undefined,
      ids(mixed)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

/** Type-level checks (never run): `partition` takes only a key that has a
 *  region, which only `.bin(p)` makes. */
export function partitionKeyTypes(): void {
  // @ts-expect-error a plain field name has no region
  srcPartition({ by: "rating", dir: "x" });
  // @ts-expect-error a field with no `.bin(p)` has no region
  srcPartition({ by: field("rating"), dir: "x" });
  // @ts-expect-error an aggregate folds the region away
  srcPartition({ by: field("rating").bin({ step: 1 }).count(), dir: "x" });
  srcPartition({ by: field("rating").bin({ step: 1 }), dir: "x" });
  srcPartition({ by: field("rating").bin({ step: 1 }).reverse(), dir: "x" });
  srcPartition({
    by: { x: field("a").bin({ step: 1 }), y: field("b").bin({ step: 1 }) },
  });
  // @ts-expect-error each axis's key needs a region too
  srcPartition({ by: { x: field("a"), y: field("b").bin({ step: 1 }) } });
  // @ts-expect-error a product divides both axes, so it takes no dir
  srcPartition({ by: { x: field("a").bin(), y: field("b").bin() }, dir: "x" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
