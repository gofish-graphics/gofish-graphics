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
 * The rows are the axis's levels: `axes: { x: { levels: [...] } }` names or
 * hides them, inner first (axes/levels.ts); a row's labels are its
 * partition's (`Calendar.<unit>.format(fn)` for custom ones).
 *
 * This module is the pure half (which labels where). Which rows, and the
 * shapes and constraints, are built in elaborate.tsx (`timeRows`,
 * `elaborateTimeAxis`).
 */
import type { CalendarPartition } from "../calendar";

/** One label of a row: its text and the tick it is centered on (`at`, epoch
 *  ms: its cell's start, or the axis's first tick for a cell that starts
 *  before the domain). */
export type TimeLabel = { at: number; text: string };

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
