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
 * `axes: { x: { rows: [...] } }` sets the rows, inner first; a row's labels
 * are its partition's (`Calendar.<unit>.format(fn)` for custom ones).
 *
 * This module is the pure half (which rows, which labels where). The shapes
 * and constraints are built in elaborate.tsx.
 */
import {
  calendarPartition,
  type CalendarJSON,
  type CalendarPartition,
} from "../calendar";

/** One entry of `axes.x.rows`: a Calendar value, or its wire form
 *  (`{ unit: "month", step: 1 }`, what Python sends). */
export type TimeRowOption = CalendarPartition | CalendarJSON;

/** One label of a row: its text and the tick it is centered on (`at`, epoch
 *  ms: its cell's start, or the axis's first tick for a cell that starts
 *  before the domain). */
export type TimeLabel = { at: number; text: string };

/** Read `axes.<dim>.rows` (inner first) into partitions. An entry that is
 *  not a Calendar value is a loud error. */
export function timeRowsFromOption(
  rows: readonly TimeRowOption[],
  axis: string
): CalendarPartition[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `axes.${axis}.rows: expected a list of Calendar values, inner row ` +
        `first, e.g. [Calendar.month, Calendar.year].`
    );
  }
  return rows.map((r, i) => calendarPartition(r, `axes.${axis}.rows[${i}]`));
}

/** The default rows of a time axis whose inner row is `inner`: `inner`,
 *  then its parent level, if it has one. */
export function defaultTimeRows(inner: CalendarPartition): CalendarPartition[] {
  const parent = inner.parent;
  return parent === undefined ? [inner] : [inner, parent];
}

/** The labels of `row` over the domain `[lo, hi]`, one per cell that meets
 *  it, as `row.label` writes them. Each is centered on its cell's start, or
 *  on the axis's first tick (`lo`) for a cell that starts before it. A cell
 *  that starts at the domain's end is labeled at that last tick, as a
 *  numeric axis labels its last tick. The `at` values are the row's ticks. */
export function rowLabels(
  row: CalendarPartition,
  lo: number,
  hi: number,
  zone: string
): TimeLabel[] {
  return row.cells(lo, hi, zone).map((cell) => ({
    at: Math.max(cell.start, lo),
    text: row.label(cell, zone),
  }));
}
