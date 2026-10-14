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
import {
  binCells,
  chainCells,
  checkBinStep,
  checkPartition,
  Cell,
  CycleCell,
  StepBin,
} from "../ast/cells";
import * as Bin from "../families/bin";
import { mergeCells } from "../ast/underlyingSpace";
import { inferPos } from "../ast/channels";
import { evalFieldValues } from "../ast/fieldExpr";
import { loadTemporal } from "../ast/calendar";
import * as Calendar from "../families/calendar";
import { splitEntries } from "../ast/datumProjection";
import { field } from "../ast/data";
import { partition as srcPartition } from "../lib";
import {
  applySchema,
  copyColumnTypes,
  setColumnTypes,
  Schema as SrcSchema,
} from "../ast/schema";
import { struct as srcStruct } from "../lib";

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
const DistBin = (GoFish as any).Bin;

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
/** The message of what `fn` throws or rejects with, if anything. */
async function errorOfAsync(
  fn: () => Promise<unknown>
): Promise<string | undefined> {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}
/** A label's width in the non-DOM text measure. */
const textWidth = (s: string) => s.length * 6;
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
/** The domain of `values` (a column's `HasDomain`): their least and
 *  greatest, missing values aside; undefined when there are none. */
const over = (values: readonly unknown[]) => {
  const ns = values.filter((v): v is number => typeof v === "number");
  return ns.length === 0
    ? undefined
    : {
        lo: ns.reduce((a, b) => Math.min(a, b)),
        hi: ns.reduce((a, b) => Math.max(a, b)),
      };
};
const edges = (cells: readonly Cell[]) => cells.map((c) => [c.start, c.end]);

async function main() {
  await loadTemporal();

  console.log("\n# numeric partitions");
  {
    const step = binCells(Bin.step(0.5), over([1.2, 2.6, 3]), undefined, "t");
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
    const tenth = binCells(Bin.step(0.1), over([0, 0.3]), undefined, "t");
    check(
      "edges are rounded multiples of the step",
      same(
        tenth.cells.map((c) => c.start),
        [0, 0.1, 0.2, 0.3]
      ),
      JSON.stringify(tenth.cells.map((c) => c.start))
    );

    const count = binCells(Bin.thresholds(10), over([0, 37, 99]), undefined, "t");
    check(
      "a count picks a round step from the domain, as axis ticks do",
      count.cells.length === 10 &&
        count.cells[0].start === 0 &&
        count.cells[9].end === 100,
      JSON.stringify(edges(count.cells))
    );
    const closed = binCells(Bin.thresholds(10), over([0, 100]), undefined, "t");
    check(
      "a thresholds partition puts the domain's top value in the last cell",
      closed.cells.length === 10 && closed.cellOf(100)?.start === 90,
      JSON.stringify(edges(closed.cells))
    );
    const list = binCells(
      Bin.thresholds([2, 5, 50]),
      over([1, 3, 9]),
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
      Bin.step(10).format((c: Cell) => `${c.start}–${c.end - 1}`),
      over([25, 34]),
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
      binCells(Bin.step(1), over([null, undefined]), undefined, "t").cells.length ===
        0
    );
  }

  console.log("\n# calendar partitions: a level alone is a part of a cycle");
  {
    const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
    const months = binCells(
      Calendar.month,
      over([t("2023-06-15"), t("2024-03-01")]),
      "UTC",
      "t"
    );
    check(
      "a month alone is the month of the year: always twelve cells, Jan to Dec",
      same(
        months.cells.map((c) => c.label),
        [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ]
      ) && months.cells.every((c) => c instanceof CycleCell),
      months.cells.map((c) => c.label).join(" ")
    );
    check(
      "all Junes are one cell, and March 1 is in March",
      months.cellOf(t("2023-06-15")) === months.cellOf(t("2023-06-30")) &&
        months.cellOf(t("2023-06-15"))?.label === "Jun" &&
        months.cellOf(t("2024-03-01"))?.label === "Mar"
    );
    const twoYears = binCells(
      Calendar.month,
      over([t("2022-06-10"), t("2023-06-20")]),
      "UTC",
      "t"
    );
    check(
      "June of two years pools into one cell",
      twoYears.cellOf(t("2022-06-10")) === twoYears.cellOf(t("2023-06-20"))
    );
    const jun = months.cells[5] as CycleCell;
    check(
      "a part knows its cycle: every part, in order",
      jun.id === "6" &&
        jun.index === 5 &&
        jun.cycle.of === "year" &&
        jun.cycle.cells.length === 12 &&
        jun.cycle.cells[5] === jun
    );
    const counts = (p: any) =>
      binCells(p, over([t("2024-01-01"), t("2024-01-02")]), "UTC", "t").cells.length;
    check(
      "the parts of each level: 31 days of a month, 24 hours, 4 quarters, " +
        "60 minutes, months in steps of 3",
      counts(Calendar.day) === 31 &&
        counts(Calendar.hour) === 24 &&
        counts(Calendar.quarter) === 4 &&
        counts(Calendar.minute) === 60 &&
        counts(Calendar.month({ every: 3 })) === 4 &&
        counts(Calendar.hour({ every: 6 })) === 4
    );
    const labelsOf = (p: any) =>
      binCells(p, over([t("2024-01-01")]), "UTC", "t").cells.map((c) => c.label);
    check(
      "parts are labeled alone: Q1, 1 to 31, 12 AM, 05",
      same(labelsOf(Calendar.quarter), ["Q1", "Q2", "Q3", "Q4"]) &&
        labelsOf(Calendar.day)[30] === "31" &&
        labelsOf(Calendar.hour)[0] === "12 AM" &&
        labelsOf(Calendar.minute)[5] === "05",
      JSON.stringify([labelsOf(Calendar.hour)[0], labelsOf(Calendar.minute)[5]])
    );
    const years = binCells(
      Calendar.year,
      over([t("2022-06-10"), t("2023-06-20")]),
      "UTC",
      "t"
    );
    const weeks = binCells(
      Calendar.week,
      over([t("2024-01-03"), t("2024-01-20")]),
      "UTC",
      "t"
    );
    check(
      "a year or a week alone stays on the time line: nothing holds it",
      same(
        years.cells.map((c) => c.label),
        ["2022", "2023"]
      ) &&
        years.cells.every((c) => c instanceof Cell) &&
        weeks.cells.length === 3 &&
        weeks.cells.every((c) => c instanceof Cell)
    );
    const fields: any[] = [];
    binCells(
      Calendar.month.format((c) => (fields.push(c), `${c.month}`)),
      over([t("2024-01-01")]),
      "UTC",
      "t"
    );
    check(
      "a part's format reads its fields; it has no year or start",
      fields.length === 12 &&
        fields[5].month === 6 &&
        Number.isNaN(fields[5].year) &&
        Number.isNaN(fields[5].start)
    );
    const days = binCells(
      [Calendar.month, Calendar.day],
      over([t("2023-02-10")]),
      "UTC",
      "t"
    );
    check(
      "a product of parts is a part too: a day of the year, February 29 kept",
      days.cells.length === 366 &&
        days.cells.some((c) => c.label === "Feb 29") &&
        days.cellOf(t("2023-02-10"))?.label === "Feb 10",
      String(days.cells.length)
    );
    const err = errorOf(() =>
      binCells(Calendar.month, over([1, 2]), undefined, 'field("n").bin(...)')
    );
    check(
      "a Calendar partition over a column that is not a time is an error",
      err?.includes("not a time") === true,
      err
    );
  }

  console.log("\n# Calendar.weekday: a day of the week");
  {
    const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
    // 2024-01-01 was a Monday.
    const twoWeeks = [t("2024-01-01"), t("2024-01-03"), t("2024-01-08")];
    const days = binCells(Calendar.weekday, over(twoWeeks), "UTC", "t");
    const labels = (cs: any): string[] => cs.cells.map((c) => c.label);
    check(
      "a weekday alone gives the 7 days of the week, from Monday",
      same(labels(days), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) &&
        days.cells.every((c) => c instanceof CycleCell),
      labels(days).join(" ")
    );
    const mon = days.cells[0] as CycleCell;
    check(
      "a weekday is a part of a week; its id is the ISO day of the week",
      mon.cycle.of === "week" &&
        mon.cycle.cells.length === 7 &&
        same(
          days.cells.map((c) => c.id),
          ["1", "2", "3", "4", "5", "6", "7"]
        )
    );
    check(
      "the Mondays of two weeks pool into one cell",
      days.cellOf(t("2024-01-01")) === days.cellOf(t("2024-01-08")) &&
        days.cellOf(t("2024-01-03"))?.label === "Wed"
    );
    const sunday = binCells(
      Calendar.weekday({ start: "sunday" }),
      over(twoWeeks),
      "UTC",
      "t"
    );
    check(
      'Calendar.weekday({ start: "sunday" }) orders the days from Sunday',
      same(labels(sunday), [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
      ]) &&
        sunday.cells[0].id === "7" &&
        sunday.cellOf(t("2024-01-01"))?.label === "Mon",
      labels(sunday).join(" ")
    );
    const fields: any[] = [];
    binCells(
      Calendar.weekday.format((c) => (fields.push(c), `${c.weekday}`)),
      over(twoWeeks),
      "UTC",
      "t"
    );
    check(
      "a weekday's format reads the ISO weekday; it has no day or month",
      fields.length === 7 &&
        same(
          fields.map((f) => f.weekday),
          [1, 2, 3, 4, 5, 6, 7]
        ) &&
        Number.isNaN(fields[0].day) &&
        Number.isNaN(fields[0].month) &&
        Number.isNaN(fields[0].start)
    );
    const monthFields: any[] = [];
    binCells(
      Calendar.month.format((c) => (monthFields.push(c), "")),
      over(twoWeeks),
      "UTC",
      "t"
    );
    check(
      "a month of the year has no weekday",
      Number.isNaN(monthFields[0].weekday)
    );
    const line = binCells(Calendar.week, over(twoWeeks), "UTC", "t").cells as Cell[];
    check(
      "a line cell's fields carry its ISO weekday",
      (line[0].calendar?.fields as any).weekday === 1
    );
    check(
      "a weekday has no steps",
      errorOf(() => Calendar.weekday({ every: 2 }))?.includes(
        'unknown field "every"'
      ) === true
    );
    check(
      "a weekday's wire form has a start and no step",
      same(Calendar.weekday, { kind: "weekday", start: "monday" }) &&
        same(Calendar.weekday({ start: "sunday" }), {
          kind: "weekday",
          start: "sunday",
        }) &&
        checkPartition({ kind: "weekday", start: "sunday" }, "w").start ===
          "sunday"
    );
    check(
      "a weekday step on the wire is a loud error",
      errorOf(() =>
        checkPartition({ kind: "weekday", every: 2 } as any, "w")
      )?.includes("w.every") === true,
      errorOf(() => checkPartition({ kind: "weekday", every: 2 } as any, "w"))
    );

    // Products and chains: a weekday is a part of a week (with the same
    // start), and a weekday is a day, so an hour is a part of it.
    const weekDays = binCells(
      [Calendar.week, Calendar.weekday],
      over([t("2024-01-01"), t("2024-01-09")]),
      "UTC",
      "t"
    );
    check(
      "[Calendar.week, Calendar.weekday]: each day, labeled by both",
      weekDays.cells.length === 9 &&
        weekDays.cells.every((c) => c instanceof Cell) &&
        weekDays.cells[0].label === "Mon, Jan 1",
      labels(weekDays).slice(0, 3).join(" | ")
    );
    const mismatch = errorOf(() =>
      checkBinStep(
        [Calendar.week({ start: "sunday" }), Calendar.weekday],
        "by"
      )
    );
    check(
      "a weekday of a week that starts on another day is an error",
      mismatch?.includes("Give both the same start") === true,
      mismatch
    );
    check(
      "a weekday is a part of a week only: [Calendar.month, Calendar.weekday] is an error",
      errorOf(() =>
        checkBinStep([Calendar.month, Calendar.weekday], "by")
      )?.includes("is a part of a week, not of a month") === true
    );
    const weekHours = binCells(
      [Calendar.weekday, Calendar.hour],
      over(twoWeeks),
      "UTC",
      "t"
    );
    check(
      "[Calendar.weekday, Calendar.hour]: the 168 hours of the week",
      weekHours.cells.length === 168 &&
        weekHours.cells[0].label === "Mon 12 AM" &&
        weekHours.cellOf(t("2024-01-08"))?.id === "1-0",
      String(weekHours.cells.length) + " " + weekHours.cells[0]?.label
    );
    const chainHours = chainCells(
      [Calendar.weekday, Calendar.hour],
      over(twoWeeks),
      "UTC",
      "t"
    );
    check(
      ".bin(Calendar.weekday).bin(Calendar.hour): the hours of each weekday",
      chainHours.cells.length === 168 &&
        (chainHours.cells[25] as CycleCell).parent?.label === "Tue" &&
        chainHours.cells[25].label === "1 AM",
      chainHours.cells[25]?.label
    );
    const weekChain = chainCells(
      [Calendar.week, Calendar.weekday],
      over([t("2024-01-01"), t("2024-01-09")]),
      "UTC",
      "t"
    );
    check(
      ".bin(Calendar.week).bin(Calendar.weekday): the days of each week",
      weekChain.cells.length === 9 &&
        weekChain.cells[7].label === "Mon" &&
        (weekChain.cells[7] as Cell).parent?.label === "Jan 8"
    );
  }

  console.log("\n# a product: one cell where its levels meet");
  {
    const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
    const months = binCells(
      [Calendar.year, Calendar.month],
      over([t("2023-11-20"), t("2024-03-02")]),
      "UTC",
      "t"
    );
    check(
      "one cell per month in the domain's range, the empty ones too, labeled " +
        "by month and year",
      same(
        months.cells.map((c) => c.label),
        ["Nov 2023", "Dec 2023", "Jan 2024", "Feb 2024", "Mar 2024"]
      ),
      months.cells.map((c) => c.label).join(" ")
    );
    const feb = months.cells[3] as Cell;
    check(
      "a product's region is where its levels meet: the 2024 year and all " +
        "Februaries meet in February 2024",
      feb instanceof Cell &&
        feb.start === t("2024-02-01") &&
        feb.end === t("2024-03-01") &&
        feb.calendar?.partition.unit === "month" &&
        months.cellOf(t("2024-02-29")) === feb
    );
    const quarters = binCells(
      [Calendar.year, Calendar.quarter],
      over([t("2024-02-01"), t("2024-08-01")]),
      "UTC",
      "t"
    );
    check(
      "a quarter's label comes first: Q1 2024",
      same(
        quarters.cells.map((c) => c.label),
        ["Q1 2024", "Q2 2024", "Q3 2024"]
      )
    );
    for (const [name, step, says] of [
      ["one level", [Calendar.month], "two or more"],
      ["a day of a year", [Calendar.year, Calendar.day], "a part of a month"],
      ["a week", [Calendar.year, Calendar.week], "part of no larger level"],
      ["a stepped parent", [Calendar.year({ every: 5 }), Calendar.month], "5 years"],
      ["a numeric bin", [Bin.step(1), Bin.step(2)], "cannot be in a product"],
      [
        "a format",
        [Calendar.year, Calendar.month.format(() => "")],
        "relabel the axis with its levels option",
      ],
    ] as const) {
      const why = errorOf(() => checkBinStep(step, "field(...).bin"));
      check(
        `a product of ${name} is an error`,
        why?.includes(says) === true,
        why
      );
    }
    check(
      "a product's wire form is a list",
      same(field("d").bin([Calendar.year, Calendar.month]).toJSON().ops, [
        {
          op: "bin",
          partition: [
            { kind: "year", every: 1 },
            { kind: "month", every: 1 },
          ],
        },
      ])
    );
  }

  console.log("\n# a chain: each bin splits the cells of the one before it");
  {
    const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
    const chained = chainCells(
      [Calendar.year, Calendar.month],
      over([t("2023-11-20"), t("2024-03-02")]),
      "UTC",
      "t"
    );
    const leaves = chained.cells as Cell[];
    check(
      "the leaves are the months of each year in the range, labeled by month",
      same(
        leaves.map((c) => c.label),
        ["Nov", "Dec", "Jan", "Feb", "Mar"]
      ),
      leaves.map((c) => c.label).join(" ")
    );
    check(
      "each leaf holds its year, the same cell for the months of one year",
      leaves[0].parent?.label === "2023" &&
        leaves[0].parent === leaves[1].parent &&
        leaves[2].parent?.label === "2024" &&
        leaves[2].parent?.start === t("2024-01-01")
    );
    check(
      "a leaf's region is its own: February 2024",
      leaves[3].start === t("2024-02-01") && leaves[3].end === t("2024-03-01")
    );
    const weeks = chainCells(
      [Calendar.year, Calendar.week],
      over([t("2023-12-20"), t("2024-01-10")]),
      "UTC",
      "t"
    );
    const cut = (weeks.cells as Cell[]).filter(
      (c) => c.start <= t("2024-01-01") && c.end >= t("2024-01-01")
    );
    check(
      "a week across New Year is cut in two, one part in each year",
      cut.length === 2 &&
        cut[0].end === t("2024-01-01") &&
        cut[1].start === t("2024-01-01") &&
        cut[0].parent?.label === "2023" &&
        cut[1].parent?.label === "2024",
      JSON.stringify(cut.map((c) => [c.label, c.start, c.end]))
    );
    const nums = chainCells(
      [Bin.step(10), Bin.step(5)],
      over([0, 3, 12, 19]),
      undefined,
      "t"
    );
    check(
      "numeric bins chain too",
      same(
        nums.cells.map((c) => c.label),
        ["0–5", "5–10", "10–15", "15–20"]
      ) && (nums.cells[1] as Cell).parent?.label === "0–10"
    );
    const cyc = chainCells(
      [Calendar.month, Calendar.day],
      over([t("2024-02-10")]),
      "UTC",
      "t"
    );
    const leaf = cyc.cellOf(t("2024-02-10")) as CycleCell;
    check(
      "on a cycle, a chain gives the parts of each part: the days of each " +
        "month of the year",
      cyc.cells.length === 366 &&
        leaf.label === "10" &&
        leaf.parent?.label === "Feb",
      String(cyc.cells.length)
    );
    for (const [name, steps, says] of [
      ["a coarser bin", [Calendar.week, Calendar.year], "is not finer"],
      [
        "weeks of a month of the year",
        [Calendar.month, Calendar.week],
        "a part of a month",
      ],
      [
        "a product",
        [Calendar.year, [Calendar.month, Calendar.day]],
        "cannot split another bin",
      ],
      [
        "times and numbers",
        [Calendar.year, Bin.step(1)],
        "a chain bins one column",
      ],
      ["a wider step", [Bin.step(2), Bin.step(5)], "is not finer"],
    ] as const) {
      const why = errorOf(() =>
        chainCells(steps as any, over([t("2024-01-01")]), "UTC", "t")
      );
      check(
        `a chain of ${name} is an error`,
        why?.includes(says) === true,
        why
      );
    }
    const early = errorOf(() =>
      field("d").bin(Calendar.month).bin(Calendar.year)
    );
    check(
      "a chain is checked when it is written",
      early?.includes("is not finer") === true ||
        early?.includes("a part of") === true,
      early
    );
    check(
      "a chain's wire form is one bin op per bin",
      same(field("d").bin(Calendar.year).bin(Calendar.month).toJSON().ops, [
        { op: "bin", partition: { kind: "year", every: 1 } },
        { op: "bin", partition: { kind: "month", every: 1 } },
      ])
    );
    const quarters = chainCells(
      [
        Calendar.year,
        Calendar.quarter.format((c) => `Q${c.quarter} ${c.year}`),
      ],
      over([t("2024-02-01"), t("2024-08-01")]),
      "UTC",
      "t"
    );
    check(
      "a Calendar value's format writes the labels of its level",
      same(
        quarters.cells.map((c) => c.label),
        ["Q1 2024", "Q2 2024", "Q3 2024"]
      )
    );
  }

  console.log("\n# partitions as written");
  {
    check(
      "the wire forms check",
      checkPartition({ kind: "month", every: 3 }, "t") instanceof Object &&
        checkPartition({ kind: "step", size: 2 }, "t") instanceof StepBin &&
        same(checkPartition({ kind: "step", size: 2 }, "t"), {
          kind: "step",
          size: 2,
        })
    );
    check(
      "a Bin strategy's own keys are its wire form",
      same(Object.keys(Bin.step(0.5)).sort(), ["kind", "size"]) &&
        same(Object.keys(Bin.thresholds(20).format(() => "")).sort(), [
          "kind",
          "thresholds",
        ])
    );
    for (const [name, p] of [
      ["a negative step", Bin.step(-1)],
      ["an infinite step", Bin.step(Infinity)],
      ["a count below 1", Bin.thresholds(0)],
      ["two partitions", { kind: "step", size: 1, thresholds: 3 }],
      ["a bare number", 10],
      ["the untagged step", { step: 1 }],
      ["the untagged thresholds", { thresholds: 10 }],
      ["the old untagged Calendar form", { unit: "month", step: 1 }],
    ] as const) {
      check(
        `${name} is an error`,
        errorOf(() => checkPartition(p, "t")) !== undefined
      );
    }
    {
      const why = errorOf(() => field("x").bin(Bin.hex({ radius: 1 }) as any));
      check(
        "a Bin kind of two fields on a field is an error naming struct",
        why?.includes("struct({ x, y }).bin(Bin.hex(...))") === true,
        why
      );
    }
    {
      const why = errorOf(() => checkPartition({ step: 1 }, "t"));
      check(
        "the untagged form's error names Bin.step",
        why?.includes("Bin.step(size)") === true,
        why
      );
    }
    check(
      "a field expression writes its partition's wire form",
      same(field("d").bin(Calendar.month({ every: 3 })).toJSON().ops, [
        { op: "bin", partition: { kind: "month", every: 3 } },
      ]) &&
        same(field("x").bin(Bin.step(0.5)).toJSON().ops, [
          { op: "bin", partition: { kind: "step", size: 0.5 } },
        ])
    );
    const noWire = errorOf(() =>
      JSON.stringify(field("x").bin(Bin.step(1).format(() => "")))
    );
    check(
      "a partition with a format has no wire form",
      noWire?.includes("no wire form") === true,
      noWire
    );
  }

  console.log("\n# a split bins over its column type's domain");
  {
    const rows = await applySchema(
      [
        { g: "A", x: 1 },
        { g: "A", x: 2 },
        { g: "B", x: 8 },
      ],
      {}
    );
    // An operator hands each group its rows with their column types, the
    // domain among them (createOperator copies them).
    const groups = splitEntries("g", rows);
    for (const leaf of groups.values()) copyColumnTypes(leaf, rows);
    const byCell = field("x").bin(Bin.step(2));
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
      field("x").bin(Bin.step(2)).reverse(),
      groups.get("A")!
    );
    check(
      "ops after bin reorder the cells",
      same([...sorted.keys()].map(String), ["8", "6", "4", "2", "0"])
    );
    // A group's cells come from its column type's domain alone, never from
    // the rows it holds or from rows outside it: a leaf whose type says
    // [0, 30] has the cells of [0, 30], whatever its rows span.
    const leaf = setColumnTypes([{ x: 5 }], {
      x: { HasDomain: { lo: 0, hi: 30 } },
    });
    const own = splitEntries(field("x").bin(Bin.step(10)), leaf);
    check(
      "a split's cells follow its column type's domain, not its rows",
      same([...own.keys()].map(String), ["0", "10", "20", "30"]) &&
        same(
          [...own.values()].map((r) => r.length),
          [1, 0, 0, 0]
        ),
      [...own.keys()].map(String).join(" ")
    );
    const count = splitEntries(field("x").bin(Bin.thresholds(3)), leaf);
    check(
      "a threshold count picks its edges over the type's domain",
      same(
        [...count.keys()].map(String),
        binCells(Bin.thresholds(3), { lo: 0, hi: 30 }, undefined, "t").cells.map(
          String
        )
      ) && count.size > 1,
      [...count.keys()].map(String).join(" ")
    );
    const untyped = errorOf(() =>
      splitEntries(field("x").bin(Bin.step(10)), [{ x: 5 }])
    );
    check(
      "rows with no column types have no domain: binning them is an error",
      untyped?.includes("no column types") === true,
      untyped
    );
    const stray = errorOf(() =>
      splitEntries(field("x").bin(Bin.step(1)), [{ x: "a" }])
    );
    check(
      "binning a column with no domain and values is an error that names it",
      stray?.includes('column "x"') === true &&
        stray.includes("finite") &&
        stray.includes('"a"'),
      stray
    );
    const times = await applySchema(
      [{ d: "2024-01-05" }, { d: "2024-03-20" }],
      { d: SrcSchema.time() }
    );
    check(
      "a time column bins into calendar cells in its zone",
      same(
        [
          ...splitEntries(
            field("d").bin([Calendar.year, Calendar.month]),
            times
          ).keys(),
        ].map((c) => (c as Cell).label),
        ["Jan 2024", "Feb 2024", "Mar 2024"]
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
        spread({ by: distField("rating").bin(DistBin.step(0.5)), dir: "x" })
      )
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
    const render = async (by: any, x: any = { title: false }) =>
      await chart(daily, {
        schema: { date: Schema.time() },
        axes: { x, y: false },
      })
        .flow(spread({ by, dir: "x" }))
        .mark(rect({ w: 30, h: distField("value").sum() }))
        .toDisplayList({ w: 400, h: 100 });
    const rectsOf = (dl: any): any[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        if (it.kind === "rect") out.push(it);
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out;
    };
    const chainedDl = await render(
      distField("date").bin(DistCalendar.year).bin(DistCalendar.month)
    );
    const texts = textsOf(chainedDl);
    const monthWords = texts.map((t) => t.text);
    check(
      "a chained key's axis has a month level, the empty February kept, and " +
        "a year level",
      same(monthWords, ["Nov", "Dec", "Jan", "Feb", "Mar", "2023", "2024"]),
      monthWords.join(" ")
    );
    const at = (w: string) => texts.find((t) => t.text === w)!;
    const mid = (w: string) => at(w).x + textWidth(w) / 2;
    check(
      "each year starts its run of months, past the month level (see " +
        "# label.align)",
      at("2023").y > at("Nov").y &&
        at("2023").x < at("Nov").x &&
        at("2024").x < at("Jan").x + textWidth("Jan"),
      JSON.stringify([at("2023").x, at("Nov").x, at("2024").x, at("Jan").x])
    );
    const bars = rectsOf(chainedDl).filter((r) => r.w === 30);
    const lines = rectsOf(chainedDl).filter((r) => r.w === 1);
    check(
      "the month level has no ticks; one divider sits centered in the gap " +
        "between the years, down through the year level",
      lines.length === 1 &&
        Math.abs(lines[0].x + 0.5 - (bars[1].x + 30 + bars[2].x) / 2) < 1e-6 &&
        lines[0].y + lines[0].h > at("2023").y,
      JSON.stringify(lines)
    );
    const productWords = textsOf(
      await render(
        distField("date").bin([DistCalendar.year, DistCalendar.month])
      )
    ).map((t) => t.text);
    check(
      "a product's axis has one level, labeled by month and year",
      same(productWords, [
        "Nov 2023",
        "Dec 2023",
        "Jan 2024",
        "Feb 2024",
        "Mar 2024",
      ]),
      productWords.join(" ")
    );
    const cycleWords = textsOf(
      await render(distField("date").bin(DistCalendar.month))
    ).map((t) => t.text);
    check(
      "a month of the year's axis has the whole year, and no year level",
      same(cycleWords, [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ]),
      cycleWords.join(" ")
    );

    console.log("\n# levels on an ordinal axis");
    const wordsOf = async (by: any, levels: any) =>
      textsOf(await render(by, { title: false, levels })).map((t) => t.text);
    const chainKey = distField("date")
      .bin(DistCalendar.year)
      .bin(DistCalendar.month);
    const productKey = distField("date").bin([
      DistCalendar.year,
      DistCalendar.month,
    ]);
    check(
      "false hides a level: [true, false] drops the years",
      same(await wordsOf(chainKey, [true, false]), [
        "Nov",
        "Dec",
        "Jan",
        "Feb",
        "Mar",
      ])
    );
    check(
      "depths the list does not reach stay inferred: [true] keeps the years",
      same(await wordsOf(chainKey, [true]), [
        "Nov",
        "Dec",
        "Jan",
        "Feb",
        "Mar",
        "2023",
        "2024",
      ])
    );
    check(
      "a Calendar value with a format relabels its level",
      same(
        await wordsOf(chainKey, [
          DistCalendar.month.format((c: any) => `${c.month}/${c.year % 100}`),
        ]),
        ["11/23", "12/23", "1/24", "2/24", "3/24", "2023", "2024"]
      )
    );
    check(
      "a coarser Calendar value past the inferred levels adds a level of runs",
      same(await wordsOf(productKey, [true, DistCalendar.year]), [
        "Nov 2023",
        "Dec 2023",
        "Jan 2024",
        "Feb 2024",
        "Mar 2024",
        "2023",
        "2024",
      ])
    );
    check(
      "a quarter groups the months of the year",
      same(
        (
          await wordsOf(distField("date").bin(DistCalendar.month), [
            true,
            DistCalendar.quarter,
          ])
        ).slice(12),
        ["Q1", "Q2", "Q3", "Q4"]
      )
    );
    const weekErr = await errorOfAsync(() =>
      wordsOf(productKey, [true, DistCalendar.week])
    );
    check(
      "a Calendar value finer than the slots is an error listing the " +
        "axis's levels",
      weekErr?.includes("axes.x.levels[1]") === true &&
        weekErr.includes("is finer than the slots") &&
        weekErr.includes("[0] [Calendar.year, Calendar.month]"),
      weekErr
    );
    // Weeks from Monday, Jan 1, 2024: the week of Jan 29 runs into
    // February and starts in January, so it is grouped with January.
    const weekDays = Array.from({ length: 6 }, (_, i) => ({
      date: `2024-${["01-01", "01-08", "01-15", "01-22", "01-29", "02-05"][i]}`,
      value: 1,
    }));
    const weekDl = await chart(weekDays, {
      schema: { date: Schema.time() },
      axes: { x: { title: false, levels: [true, DistCalendar.month] }, y: false },
    })
      .flow(spread({ by: distField("date").bin(DistCalendar.week), dir: "x" }))
      .mark(rect({ w: 20, h: distField("value").sum() }))
      .toDisplayList({ w: 400, h: 100 });
    const weekTexts = textsOf(weekDl);
    const weekMonths = weekTexts
      .filter((t) => t.text === "Jan" || t.text === "Feb")
      .map((t) => t.text);
    const weekBars = rectsOf(weekDl).filter((r) => r.w === 20);
    const weekLines = rectsOf(weekDl).filter((r) => r.w === 1);
    check(
      "a month level over week slots groups each week by the month it " +
        "starts in: Jan's run holds the week of Jan 29, then one divider",
      same(weekMonths, ["Jan", "Feb"]) &&
        weekLines.length === 1 &&
        weekLines[0].x > weekBars[4].x + 20 &&
        weekLines[0].x < weekBars[5].x,
      JSON.stringify({ weekMonths, weekLines })
    );
    const pastErr = await errorOfAsync(() =>
      wordsOf(chainKey, [true, true, true])
    );
    check(
      "an entry past the last level is an error listing the levels",
      pastErr?.includes("axes.x.levels[2]") === true &&
        pastErr.includes("[0] Calendar.month, [1] Calendar.year"),
      pastErr
    );
    const splitErr = await errorOfAsync(async () =>
      textsOf(
        await chart([{ g: "a", v: 1 }], {
          axes: { x: { levels: [DistCalendar.year] }, y: false },
        })
          .flow(spread({ by: "g", dir: "x" }))
          .mark(rect({ w: 10, h: "v" }))
          .toDisplayList({ w: 100, h: 100 })
      )
    );
    check(
      "a Calendar value over the groups of a split is an error",
      splitErr?.includes("not cells of a time column") === true,
      splitErr
    );
    // A grouped chart: categories ("g") inside months. The two levels bin
    // different columns, so neither partitions the other: no dividers,
    // unless `divider` asks for them.
    const groupedBy = async (outer: any, x: any) =>
      await chart(
        daily.flatMap((d) => ["a", "b"].map((g) => ({ ...d, g }))),
        { schema: { date: Schema.time() }, axes: { x, y: false } }
      )
        .flow(spread({ by: outer, dir: "x" }), spread({ by: "g", dir: "x" }))
        .mark(rect({ w: 10, h: distField("value").sum() }))
        .toDisplayList({ w: 400, h: 100 });
    const linesOf = (dl: any) => rectsOf(dl).filter((r) => r.w === 1);
    const grouped = await groupedBy(productKey, {
      title: false,
      levels: [false, true],
    });
    const groupedWords = textsOf(grouped).map((t) => t.text);
    check(
      "[false, true] hides a grouped chart's inner level; the months over " +
        "categories draw no dividers",
      !groupedWords.includes("a") &&
        groupedWords.includes("Nov 2023") &&
        linesOf(grouped).length === 0,
      `${groupedWords.join(" ")} / ${linesOf(grouped).length}`
    );
    const groupedOn = await groupedBy(productKey, {
      title: false,
      levels: [false, true],
      divider: [false, true],
    });
    const groupedAll = await groupedBy(productKey, {
      title: false,
      divider: true,
    });
    check(
      "divider: [false, true] turns on the outer level's dividers, one per " +
        "month boundary; divider: true also divides the inner level's slots " +
        "(one gap in each of the four months with rows)",
      linesOf(groupedOn).length === 4 && linesOf(groupedAll).length === 8,
      `${linesOf(groupedOn).length} / ${linesOf(groupedAll).length}`
    );

    // Categories inside a chained key: the year partitions the date's
    // months, and the months do not partition "g". A divider runs from the
    // plot edge through every row that breaks in its gap, only where the
    // year breaks.
    const nested = await groupedBy(chainKey, { title: false });
    const nestedTexts = textsOf(nested);
    const nAt = (w: string) => nestedTexts.find((t) => t.text === w)!;
    const nBars = rectsOf(nested).filter((r) => r.w === 10);
    const plotEdge = Math.max(...nBars.map((b) => b.y + b.h));
    const nLines = linesOf(nested);
    check(
      "mixed: one divider, at the year boundary, from the plot edge through " +
        "the category, month and year rows",
      nLines.length === 1 &&
        Math.abs(nLines[0].y - plotEdge) < 1e-6 &&
        nLines[0].y + nLines[0].h > nAt("2023").y,
      JSON.stringify({ plotEdge, nLines })
    );
    const cAt = (w: string) => texts.find((t) => t.text === w)!;
    const chainedBars = rectsOf(chainedDl).filter((r) => r.w === 30);
    const cEdge = Math.max(...chainedBars.map((b) => b.y + b.h));
    check(
      "mixed: the category row sits as far past the plot edge as a chained " +
        "key's first row; the month row sits 6px further past it than the " +
        "chained key's year row past its months (8px past categories, 2px " +
        "between the levels of one value)",
      Math.abs(nAt("a").y - plotEdge - (cAt("Nov").y - cEdge)) < 1e-6 &&
        Math.abs(
          nAt("Nov").y - nAt("a").y - (cAt("2023").y - cAt("Nov").y) - 6
        ) < 1e-6 &&
        Math.abs(lines[0].y - cEdge) < 1e-6,
      JSON.stringify([nAt("a").y, nAt("Nov").y, plotEdge, cAt("Nov").y, cEdge])
    );
    const nestedOff = await groupedBy(chainKey, {
      title: false,
      divider: false,
    });
    check(
      "divider: false turns a partition's dividers off",
      linesOf(nestedOff).length === 0,
      `${linesOf(nestedOff).length}`
    );

    // Nested splits that bin the same column partition one value, as one
    // chained key does: the same dividers and the same row gaps.
    const split = await chart(daily, {
      schema: { date: Schema.time() },
      axes: { x: { title: false }, y: false },
    })
      .flow(
        spread({ by: distField("date").bin(DistCalendar.year), dir: "x" }),
        spread({ by: distField("date").bin(DistCalendar.month), dir: "x" })
      )
      .mark(rect({ w: 30, h: distField("value").sum() }))
      .toDisplayList({ w: 400, h: 100 });
    const sTexts = textsOf(split);
    const sAt = (w: string) => sTexts.find((t) => t.text === w)!;
    const sLines = linesOf(split);
    const sEdge = Math.max(
      ...rectsOf(split)
        .filter((r) => r.w === 30)
        .map((b) => b.y + b.h)
    );
    check(
      "nested splits over one date: one divider between the years, from " +
        "the plot edge, and the rows 2px apart like a chained key's",
      sLines.length === 1 &&
        Math.abs(sLines[0].y - sEdge) < 1e-6 &&
        Math.abs(sLines[0].h - lines[0].h) < 1e-6 &&
        Math.abs(
          sAt("2023").y - sAt("Nov").y - (cAt("2023").y - cAt("Nov").y)
        ) < 1e-6,
      JSON.stringify({ sLines, lines })
    );

    // Numeric bins inside bins of the same column partition it too.
    const numeric = await chart(
      [1, 3, 7, 12, 14, 18].map((v) => ({ v })),
      { axes: { x: { title: false }, y: false } }
    )
      .flow(
        spread({ by: distField("v").bin(DistBin.step(10)), dir: "x" }),
        spread({ by: distField("v").bin(DistBin.step(5)), dir: "x" })
      )
      .mark(rect({ w: 20, h: 10 }))
      .toDisplayList({ w: 400, h: 100 });
    check(
      "numeric bins inside bins of one column: one divider between the " +
        "outer bins",
      linesOf(numeric).length === 1,
      `${linesOf(numeric).length} / ${textsOf(numeric)
        .map((t) => t.text)
        .join(" ")}`
    );

    // Bins of different columns are categories of each other.
    const twoColumns = await chart(
      [1, 3, 7, 12, 14, 18].map((v) => ({ v, w: v * 2 })),
      { axes: { x: { title: false }, y: false } }
    )
      .flow(
        spread({ by: distField("v").bin(DistBin.step(10)), dir: "x" }),
        spread({ by: distField("w").bin(DistBin.step(10)), dir: "x" })
      )
      .mark(rect({ w: 20, h: 10 }))
      .toDisplayList({ w: 400, h: 100 });
    check(
      "bins of one column inside bins of another draw no dividers",
      linesOf(twoColumns).length === 0,
      `${linesOf(twoColumns).length}`
    );

    // Categories inside categories (a lake over its species): no dividers.
    const lakes = await chart(
      [
        { lake: "A", species: "bass" },
        { lake: "A", species: "trout" },
        { lake: "B", species: "bass" },
        { lake: "B", species: "trout" },
      ],
      { axes: { x: { title: false }, y: false } }
    )
      .flow(spread({ by: "lake", dir: "x" }), spread({ by: "species", dir: "x" }))
      .mark(rect({ w: 20, h: 10 }))
      .toDisplayList({ w: 400, h: 100 });
    check(
      "categories inside categories draw no dividers",
      linesOf(lakes).length === 0,
      `${linesOf(lakes).length}`
    );
    const continuousErr = await errorOfAsync(() =>
      chart([{ g: "a", v: 1 }], { axes: { y: { divider: true } } })
        .flow(spread({ by: "g", dir: "x" }))
        .mark(rect({ w: 10, h: "v" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "divider: true on a continuous axis's level is an error",
      continuousErr?.includes("axes.y.divider") === true,
      continuousErr
    );
    const badErr = await errorOfAsync(() =>
      chart([{ g: "a", v: 1 }], { axes: { x: { divider: "yes" } } } as any)
        .flow(spread({ by: "g", dir: "x" }))
        .mark(rect({ w: 10, h: "v" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "a divider that is not a boolean or a list of them is an error",
      badErr?.includes("axes.x.divider") === true,
      badErr
    );
    const unknownErr = await errorOfAsync(() =>
      chart([{ g: "a", v: 1 }], { axes: { x: { dividers: true } } } as any)
        .flow(spread({ by: "g", dir: "x" }))
        .mark(rect({ w: 10, h: "v" }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "the axis-option key check takes divider and lists it",
      unknownErr?.includes('unknown option "dividers"') === true &&
        unknownErr.includes('"divider"'),
      unknownErr
    );

    console.log("\n# label.align");
    // A chained key: the outer (year) level is over cells, so ordered.
    const yearX = (dl: any) => textsOf(dl).find((t) => t.text === "2024")!.x;
    const chainedBarsX = rectsOf(chainedDl).filter((r) => r.w === 30);
    const divider = rectsOf(chainedDl).filter((r) => r.w === 1)[0];
    check(
      "an outer level over cells starts each run 3px past its divider, and " +
        "the first run at the axis start",
      Math.abs(yearX(chainedDl) - (divider.x + 0.5 + 3)) < 1e-6 &&
        Math.abs(cAt("2023").x - chainedBarsX[0].x) < 1e-6,
      JSON.stringify([yearX(chainedDl), divider.x, cAt("2023").x])
    );
    check(
      "the innermost level stays centered",
      Math.abs(mid("Nov") - (chainedBarsX[0].x + 15)) < 0.5,
      `${mid("Nov")}`
    );
    const centered = await render(chainKey, {
      title: false,
      label: { align: [true, "center"] },
    });
    const cTexts = textsOf(centered);
    const cMid = (w: string) => {
      const t = cTexts.find((x: any) => x.text === w)!;
      return t.x + textWidth(w) / 2;
    };
    const cBars = rectsOf(centered).filter((r) => r.w === 30);
    check(
      "label.align [true, \"center\"] centers the year level",
      Math.abs(cMid("2023") - (cBars[0].x + cBars[1].x + 30) / 2) < 0.5,
      `${cMid("2023")}`
    );
    // A split over categories: ordered only when the schema says so.
    const catRows = ["p", "q"].flatMap((g) =>
      ["a", "b"].map((s) => ({ g, s, v: 1 }))
    );
    const outerX = async (schema: any) => {
      const dl = await chart(catRows, {
        schema,
        axes: { x: { title: false }, y: false },
      })
        .flow(spread({ by: "g", dir: "x" }), spread({ by: "s", dir: "x" }))
        .mark(rect({ w: 20, h: "v" }))
        .toDisplayList({ w: 300, h: 100 });
      const t = textsOf(dl).find((x: any) => x.text === "q")!;
      const bars = rectsOf(dl).filter((r) => r.w === 20);
      return { left: t.x, mid: t.x + textWidth("q") / 2, bars };
    };
    const plain = await outerX(undefined);
    check(
      "an outer level over unordered categories centers",
      Math.abs(plain.mid - (plain.bars[2].x + plain.bars[3].x + 20) / 2) < 0.5,
      JSON.stringify(plain.mid)
    );
    const ordered = await outerX({ g: Schema.ordered(["p", "q"]) });
    check(
      "an outer level over a Schema.ordered column starts its runs",
      ordered.left > ordered.bars[1].x + 20 &&
        ordered.left < ordered.bars[2].x + 3,
      JSON.stringify([ordered.left, ordered.bars[2].x])
    );
    const startErr = await errorOfAsync(() =>
      chart([{ v: 1, w: 2 }], {
        axes: { x: { label: { align: "start" } }, y: false },
      })
        .flow(scatter({ x: "v", y: "w" }))
        .mark(circle({ r: 2 }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "label.align \"start\" on a continuous axis is an error",
      startErr?.includes("axes.x.label.align") === true &&
        startErr.includes("continuous"),
      startErr
    );
    const badAlign = await errorOfAsync(() =>
      render(chainKey, { title: false, label: { align: "left" } })
    );
    check(
      "an unknown label.align value is an error",
      badAlign?.includes("axes.x.label.align: unknown value") === true,
      badAlign
    );
    // The flat key this nested option replaced is an unknown key now; the
    // error names the keys an axis takes, `label` among them.
    const flatAlign = await errorOfAsync(() =>
      render(chainKey, { title: false, labelAlign: "center" } as any)
    );
    check(
      "the old flat labelAlign key is an error naming label",
      flatAlign?.includes('axes.x: unknown option "labelAlign"') === true &&
        flatAlign.includes('"label"'),
      flatAlign
    );

    console.log("\n# table over binned keys");
    // Three days: a Monday and a Tuesday in January 2024, a Monday in
    // February (Jan 1, 2024 is a Monday).
    const days = ["2024-01-01", "2024-01-02", "2024-02-05"].map((date) => ({
      date,
      v: 1,
    }));
    const tableDl = await chart(days, {
      schema: { date: Schema.time() },
      axes: { x: { title: false }, y: { title: false } },
    })
      .flow(
        table({
          by: {
            x: distField("date").bin(DistCalendar.year).bin(DistCalendar.month),
            y: distField("date").bin(DistCalendar.weekday),
          },
        })
      )
      .mark(rect({ w: 10, h: 10, fill: "steelblue" }))
      .toDisplayList({ w: 200, h: 200 });
    const tableWords = textsOf(tableDl).map((t) => t.text);
    check(
      "table takes binned keys: a chained month column level with a year " +
        "level, and the seven weekdays as rows, the empty ones kept",
      ["Jan", "Feb", "2024", "Mon", "Tue", "Sun"].every((w) =>
        tableWords.includes(w)
      ) && !tableWords.some((w) => w.includes("[object")),
      tableWords.join(" ")
    );
    const tableCells = rectsOf(tableDl).filter((r) => r.w === 10);
    check(
      "a table over binned keys has one cell per column and row (2 × 7)",
      tableCells.length === 14,
      `${tableCells.length}`
    );

    console.log("\n# partition over the parts of a cycle");
    const cycleErr = async (step: any) =>
      await errorOfAsync(() =>
        chart(days, { schema: { date: Schema.time() }, axes: false })
          .flow(partition({ by: distField("date").bin(step), dir: "x" }))
          .mark(rect({ h: 10 }))
          .toDisplayList({ w: 200, h: 100 })
      );
    const weekdayErr = await cycleErr(DistCalendar.weekday);
    check(
      "the error over a weekday names the week fixes, not the year",
      weekdayErr?.includes("parts of a week") === true &&
        weekdayErr.includes(
          'field("date").bin([Calendar.week({ start: "monday" }), ' +
            'Calendar.weekday({ start: "monday" })])'
        ) &&
        weekdayErr.includes(
          'field("date").bin(Calendar.week({ start: "monday" })).bin('
        ) &&
        !weekdayErr.includes("year"),
      weekdayErr
    );
    const monthErr = await cycleErr(DistCalendar.month);
    check(
      "the error over a month of the year names the year fixes",
      monthErr?.includes("parts of a year") === true &&
        monthErr.includes(
          'field("date").bin([Calendar.year, Calendar.month])'
        ) &&
        monthErr.includes('field("date").bin(Calendar.year).bin(Calendar.month)'),
      monthErr
    );

    console.log("\n# a color with no value");
    const heat = async (fill: any) =>
      rectsOf(
        await chart(days, {
          schema: { date: Schema.time() },
          axes: false,
          legend: false,
        })
          .flow(
            table({
              by: {
                x: distField("date")
                  .bin(DistCalendar.year)
                  .bin(DistCalendar.month),
                y: distField("date").bin(DistCalendar.weekday),
              },
            })
          )
          .mark(rect({ w: 10, h: 10, fill }))
          .toDisplayList({ w: 200, h: 200 })
      ).filter((r) => r.w === 10);
    const meanCells = await heat(distField("v").mean());
    check(
      "a mark whose color is the mean of no rows is not drawn; the cells " +
        "with rows are",
      meanCells.length === 3,
      `${meanCells.length}`
    );
    check(
      "a color that is the sum or count of no rows is 0 and draws",
      (await heat(distField("v").sum())).length === 14 &&
        (await heat(distField("v").count())).length === 14
    );
    const placed = await chart(days, {
      schema: { date: Schema.time() },
      axes: false,
      legend: false,
    })
      .flow(
        spread({ by: distField("date").bin(DistCalendar.weekday), dir: "x" })
      )
      .mark(rect({ w: 10, h: 10, fill: distField("v").mean() }))
      .toDisplayList({ w: 200, h: 100 });
    const placedRects = rectsOf(placed).filter((r) => r.w === 10);
    check(
      "a mark that is not drawn keeps its place: the drawn weekdays sit in " +
        "their own slots",
      placedRects.length === 2 &&
        placedRects[1].x - placedRects[0].x > 0 &&
        placedRects[1].x - placedRects[0].x < 30,
      JSON.stringify(placedRects.map((r) => r.x))
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
          partition({
            by: distField("rating").bin(DistBin.step(0.5)),
            dir: "x",
          })
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
          partition({
            by: distField("date").bin([DistCalendar.year, DistCalendar.month]),
            dir: "x",
          })
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
            by: distField("date")
              .bin(DistCalendar.year)
              .bin(DistCalendar.month),
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
      const px = partition({
        by: distField("a").bin(DistBin.step(1)),
        dir: "x",
      });
      const py = partition({
        by: distField("b").bin(DistBin.step(1)),
        dir: "y",
      });
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
                  k !== "id" && (typeof v === "number" || typeof v === "string")
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
      x: distField("a").bin(DistBin.step(1)),
      y: distField("b").bin(DistBin.step(1)),
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
          (r, i) => r.w === 10 && Math.abs(r.x - fixed1D[0].x - 100 * i) < 1e-6
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
    const byCell = () => distField("x").bin(DistBin.step(1));
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
        spread({
          by: distField("x").bin(DistBin.thresholds([10, 90])),
          dir: "x",
        }),
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
          .flow(spread({ by: distField("x").bin(DistBin.step(2)), dir: "x" }))
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

  console.log("\n# a column with an infinite value");
  {
    // A column with an infinite value has no domain (applySchema), so
    // binning it is an error that names it, and never a loop over cells to
    // the end of the line.
    const typed = await applySchema([
      { x: 0, a: 0, b: 0 },
      { x: Infinity, a: 1, b: Infinity },
    ]);
    for (const [name, by, column] of [
      ["a step", field("x").bin(Bin.step(1)), 'column "x"'],
      ["a threshold count", field("x").bin(Bin.thresholds(10)), 'column "x"'],
      [
        "hexagons",
        srcStruct({ x: "a", y: "b" }).bin(Bin.hex({ radius: 1 })),
        'column "b"',
      ],
    ] as const) {
      const message = errorOf(() => splitEntries(by as any, typed)) ?? "";
      check(
        `${name} over an infinite value is an error that names the column`,
        message.includes(column) && message.includes("finite"),
        message
      );
    }
  }

  console.log("\n# the domain of the chart's data, in every group");
  {
    // Ages of group A span 0 to 40, of group B 30 to 99. The column type's
    // domain is 0 to 99, so both rows of bars have the same ten bins.
    const ages = [
      ...Array.from({ length: 30 }, (_, i) => ({
        group: "A",
        age: (i * 17) % 41,
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        group: "B",
        age: 30 + ((i * 23) % 70),
      })),
    ];
    const rects = async (flow: unknown[]) =>
      chart(ages)
        .flow(...flow)
        .mark(rect({ w: 3, h: distField("age").count() }))
        .toDisplayList({ w: 300, h: 200 })
        .then(
          (dl: any) => {
            const out: any[] = [];
            const walk = (it: any) => {
              if (it.kind === "rect") out.push(it);
              for (const c of it.children ?? []) walk(c);
            };
            dl.items.forEach(walk);
            return out.length;
          },
          (e: Error) => e.message
        );
    const byAge = () =>
      spread({ by: distField("age").bin(DistBin.thresholds(10)), dir: "x" });
    const both = await rects([spread({ by: "group", dir: "y" }), byAge()]);
    check(
      "each group of a nested split has the ten bins of the column's domain",
      both === 20,
      String(both)
    );
    const filtered = await rects([
      GoFish.filter((r: any) => r.group === "A"),
      byAge(),
    ]);
    check(
      "a filter's result keeps its input's domain",
      filtered === 10,
      String(filtered)
    );
    const derived = await rects([
      GoFish.derive((rows: any[]) => rows.filter((r) => r.group === "A")),
      byAge(),
    ]);
    const ownCells = binCells(
      Bin.thresholds(10),
      { lo: 0, hi: 40 },
      undefined,
      "t"
    ).cells.length;
    check(
      "a derive's result has its own domain",
      derived === ownCells && ownCells !== 10,
      `${derived} / ${ownCells}`
    );
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
      binCells(p, over([t(lo), t(hi)]), "UTC", "t").cells;
    const months = calendarCells(
      [Calendar.year, Calendar.month],
      "2024-01-10",
      "2024-01-20"
    );
    const days = calendarCells(
      [Calendar.year, Calendar.month, Calendar.day],
      "2024-03-04",
      "2024-03-06"
    );
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
  srcPartition({ by: field("rating").bin(Bin.step(1)).count(), dir: "x" });
  srcPartition({ by: field("rating").bin(Bin.step(1)), dir: "x" });
  srcPartition({ by: field("rating").bin(Bin.step(1)).reverse(), dir: "x" });
  srcPartition({
    by: { x: field("a").bin(Bin.step(1)), y: field("b").bin(Bin.step(1)) },
  });
  // @ts-expect-error each axis's key needs a region too
  srcPartition({ by: { x: field("a"), y: field("b").bin(Bin.step(1)) } });
  // @ts-expect-error a product divides both axes, so it takes no dir
  srcPartition({ by: { x: field("a").bin(), y: field("b").bin() }, dir: "x" });
  field("a").bin(Bin.thresholds([0, 5, 10]).format((c) => String(c.start)));
  // @ts-expect-error a month of the year has no one region on the time line
  srcPartition({ by: field("d").bin(Calendar.month), dir: "x" });
  srcPartition({ by: field("d").bin(Calendar.year), dir: "x" });
  srcPartition({
    by: field("d").bin([Calendar.year, Calendar.month]),
    dir: "x",
  });
  srcPartition({
    by: field("d").bin(Calendar.year).bin(Calendar.month),
    dir: "x",
  });
  srcPartition({
    // @ts-expect-error a chain over a part of a cycle stays a part
    by: field("d").bin(Calendar.month).bin(Calendar.day),
    dir: "x",
  });
  // @ts-expect-error Bin.hex bins two fields together, not one
  field("a").bin(Bin.hex({ radius: 1 }));
  // @ts-expect-error the untagged form is gone: write Bin.step(1)
  field("a").bin({ step: 1 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
