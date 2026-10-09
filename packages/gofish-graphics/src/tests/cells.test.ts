/**
 * Cells (#1058): `field(x).bin(p)` maps each value to its cell. Covers the
 * cells of each kind of partition, where a value falls, the domain a split
 * bins over (every group sees the chart's cells, empty ones included, #763),
 * the wire form, and the axis over cells (labels between boundary ticks, and
 * a year row over calendar months).
 *
 * Run: `pnpm build && tsx src/tests/cells.test.ts` (wired as `pnpm
 * test:cells`). The rendering checks import from `dist`, like time.test.ts.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import "../lib";
import { binCells, checkPartition, Cell } from "../ast/cells";
import { Calendar, loadTemporal } from "../ast/calendar";
import { splitEntries } from "../ast/datumProjection";
import { field } from "../ast/data";
import {
  applySchema,
  copyColumnTypes,
  Schema as SrcSchema,
} from "../ast/schema";

const { chart, spread, rect, Schema } = GoFish as any;
const DistCalendar = (GoFish as any).Calendar;
const distField = (GoFish as any).field;

declare const process: { exit(code: number): never };

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
      binCells(Calendar.month, [1, 2], undefined, "field(\"n\").bin(...)")
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
      same(
        [...a.keys()].map(String),
        ["0", "2", "4", "6", "8"]
      ) && same([...a.keys()], [...b.keys()]),
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
      same(
        [...sorted.keys()].map(String),
        ["8", "6", "4", "2", "0"]
      )
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
      .flow(
        spread({ by: distField("rating").bin({ step: 0.5 }), dir: "x" })
      )
      .mark(rect({ w: 20, h: distField("rating").count() }))
      .toDisplayList({ w: 300, h: 100 });
    const words = textsOf(dl).map((t) => t.text);
    check(
      "a histogram labels every cell with its edges, the empty one too",
      same(words, ["1–1.5", "1.5–2", "2–2.5", "2.5–3"]),
      words.join(" ")
    );

    const daily = [
      "2023-11-20",
      "2023-12-05",
      "2024-01-10",
      "2024-03-02",
    ].map((date) => ({ date, value: 1 }));
    const monthDl = await chart(daily, {
      schema: { date: Schema.time() },
      axes: { x: { title: false }, y: false },
    })
      .flow(
        spread({ by: distField("date").bin(DistCalendar.month), dir: "x" })
      )
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
