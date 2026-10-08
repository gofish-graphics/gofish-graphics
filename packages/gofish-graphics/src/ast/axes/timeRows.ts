// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

/**
 * The rows of a time axis (#1057). A time axis is a continuous axis whose
 * ticks come from calendar partitions (calendar.ts): a "partitioned axis".
 * Every position comes from the axis's continuous scale (epoch ms → pixels);
 * nothing sits in ordinal slots.
 *
 * Each row is one partition, e.g. months, or hours in steps of 6. Its ticks
 * are the starts of the partition's cells inside the domain, and each label
 * is centered on its cell's start tick, as a numeric axis centers its labels
 * on its ticks. Rows are independent partitions of the same time line, so
 * they need not nest (`[Calendar.week, Calendar.month]` is fine).
 *
 * The axis's domain is niced outward to the cells of its inner row
 * (`niceContinuous`), as a numeric axis's domain is niced to its tick step,
 * so both ends of the axis are ticks of the inner row. An outer row's first
 * cell can still start before the domain: its label is centered on the
 * axis's first tick, under the inner row's first label ("2023" under "Nov").
 *
 * By default an axis has two rows: the inner row is the level-and-step its
 * domain picks for about 10 ticks (`tickPartition` in calendar.ts, like d3's
 * time ticks), and the outer row is that level's parent (hours → days, days
 * → months, months → years). A level with no parent (years) gives one row.
 * `axes: { x: { rows: [...] } }` sets the rows, inner first.
 *
 * This module is the pure half (which rows, which labels where). The shapes
 * and constraints are built in elaborate.tsx.
 */
import {
  CalendarPartition,
  calendarPartition,
  type CalendarCell,
  type CalendarJSON,
} from "../calendar";

/** A custom label for a row's cells. */
export type CellFormat = (cell: CalendarCell) => string;

/** One entry of `axes.x.rows`: a Calendar value (default labels), or one
 *  with a `format` function for its labels, `{ unit, format }`, whose `unit`
 *  is a Calendar value. The wire form of a Calendar value
 *  (`{ unit: "month", step: 1 }`, what Python sends) is accepted in both
 *  places. */
export type TimeRowOption =
  | CalendarPartition
  | CalendarJSON
  | { unit: CalendarPartition | CalendarJSON; format?: CellFormat };

/** A resolved row: a partition and how its cells are labeled. */
export type TimeRow = { partition: CalendarPartition; format?: CellFormat };

/** One label of a row: its text and the tick it is centered on (`at`, epoch
 *  ms: its cell's start, or the axis's first tick for a cell that starts
 *  before the domain). */
export type TimeLabel = { at: number; text: string };

/** Read `axes.<dim>.rows` (inner first) into rows. An entry is the row
 *  form `{ unit, format }` when it has a `format` key or its `unit` is not a
 *  level name (a wire form's `unit` is a string, like `"month"`); either way
 *  the Calendar value is read by `calendarPartition`. An entry that is not a
 *  Calendar value is a loud error. */
export function timeRowsFromOption(
  rows: readonly TimeRowOption[],
  axis: string
): TimeRow[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `axes.${axis}.rows: expected a list of Calendar values, inner row ` +
        `first, e.g. [Calendar.month, Calendar.year].`
    );
  }
  return rows.map((r, i) => {
    const where = `axes.${axis}.rows[${i}]`;
    if (
      r !== null &&
      typeof r === "object" &&
      !(r instanceof CalendarPartition) &&
      ("format" in r || typeof (r as { unit?: unknown }).unit !== "string")
    ) {
      const { unit, format } = r as {
        unit: CalendarPartition | CalendarJSON;
        format?: unknown;
      };
      if (format !== undefined && typeof format !== "function") {
        throw new Error(
          `${where}.format: expected a function of the cell, ` +
            `(cell) => string.`
        );
      }
      return {
        partition: calendarPartition(unit, `${where}.unit`),
        format: format as CellFormat | undefined,
      };
    }
    return {
      partition: calendarPartition(
        r as CalendarPartition | CalendarJSON,
        where
      ),
    };
  });
}

/** The default rows of a time axis whose inner row is `inner`: `inner`,
 *  then its parent level, if it has one. */
export function defaultTimeRows(inner: CalendarPartition): TimeRow[] {
  const parent = inner.parent;
  return parent === undefined
    ? [{ partition: inner }]
    : [{ partition: inner }, { partition: parent }];
}

/** The labels of `row` over the domain `[lo, hi]`, one per cell that meets
 *  it. Each is centered on its cell's start, or on the axis's first tick
 *  (`lo`) for a cell that starts before it. A cell that starts at the
 *  domain's end is labeled at that last tick, as a numeric axis labels its
 *  last tick. The `at` values are the row's ticks. */
export function rowLabels(
  row: TimeRow,
  lo: number,
  hi: number,
  zone: string
): TimeLabel[] {
  return row.partition.cells(lo, hi, zone).map((cell) => ({
    at: Math.max(cell.start, lo),
    text: row.format ? row.format(cell) : row.partition.label(cell, zone),
  }));
}
