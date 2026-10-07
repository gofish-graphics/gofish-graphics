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
 * are the starts of the partition's cells inside the domain, and its labels
 * are those cells, each at its cell's start, or at the axis start for a
 * partial first cell. Rows are independent partitions of the same time line,
 * so they need not nest (`[Calendar.week, Calendar.month]` is fine).
 *
 * By default an axis has two rows: the inner row is the finest
 * level-and-step whose labels fit, and the outer row is that level's parent
 * (hours → days, days → months, months → years). A level with no parent
 * (years) gives one row. `axes: { x: { rows: [...] } }` sets the rows, inner
 * first.
 *
 * This module is the pure half (which rows, which labels where). The shapes
 * and constraints are built in elaborate.tsx.
 */
import {
  CalendarPartition,
  calendarPartition,
  type CalendarCell,
  type CalendarJSON,
  type CalendarUnit,
} from "../calendar";

/** A custom label for a row's cells. */
export type CellFormat = (cell: CalendarCell) => string;

/** One entry of `axes.x.rows`: a Calendar value (default labels), or one
 *  with a `format` function for its labels. The wire form of a Calendar
 *  value (`{ unit: "month", step: 1 }`, what Python sends) is accepted too. */
export type TimeRowOption =
  | CalendarPartition
  | CalendarJSON
  | { unit: CalendarPartition | CalendarJSON; format?: CellFormat };

/** A resolved row: a partition and how its cells are labeled. */
export type TimeRow = { partition: CalendarPartition; format?: CellFormat };

/** One label of a row: its text, where it sits (`at`, epoch ms: the cell's
 *  start, or the axis start for a partial first cell), and its cell. */
export type TimeLabel = { at: number; text: string; cell: CalendarCell };

/** The steps the default rows try for each level, finest first. Weeks and
 *  quarters are never picked by default (a week row can be asked for; a
 *  quarter row is months in steps of 3 with other labels). */
const AUTO_STEPS: [CalendarUnit, number[]][] = [
  ["second", [1, 5, 15, 30]],
  ["minute", [1, 5, 15, 30]],
  ["hour", [1, 3, 6, 12]],
  ["day", [1, 2]],
  ["month", [1, 2, 3]],
  ["year", [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]],
];

/** Pixels between a tick and the label right of it. */
export const TIME_LABEL_PAD = 3;
/** The least room a label needs past its own width before the next one. */
const LABEL_CLEARANCE = 5;

/** Read `axes.<dim>.rows` (inner first) into rows. An entry that is not a
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
      "unit" in r &&
      typeof (r as { unit: unknown }).unit === "object"
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
        partition: calendarPartition(unit, where),
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

/** The labels of `row` over the domain `[lo, hi]`, one per cell that covers
 *  some of it, before any is dropped for room. A cell that starts at the
 *  domain's end has only a tick there, no label. */
export function rowLabels(
  row: TimeRow,
  lo: number,
  hi: number,
  zone: string
): TimeLabel[] {
  const cells = row.partition.cells(lo, hi, zone);
  return cells
    .filter((cell) => cell.start < hi || lo === hi)
    .map((cell) => ({
      at: Math.max(cell.start, lo),
      text: row.format ? row.format(cell) : row.partition.label(cell, zone),
      cell,
    }));
}

/** The ticks of `row` over `[lo, hi]`: its cell starts inside the domain. */
export function rowTicks(
  row: TimeRow,
  lo: number,
  hi: number,
  zone: string
): number[] {
  return row.partition
    .cells(lo, hi, zone)
    .map((c) => c.start)
    .filter((t) => t >= lo && t <= hi);
}

/**
 * The labels of a row that have room: a label is dropped when it would run
 * into the next one (its pad, its width, and a clearance must fit before the
 * next label's position). The last label may run past the axis end. In
 * practice only a narrow partial first cell drops its label.
 */
export function labelsWithRoom(
  labels: TimeLabel[],
  pxPerMs: number,
  textWidth: (s: string) => number
): TimeLabel[] {
  return labels.filter((l, k) => {
    const next = labels[k + 1];
    if (next === undefined) return true;
    const room = (next.at - l.at) * pxPerMs;
    return TIME_LABEL_PAD + textWidth(l.text) + 2 <= room;
  });
}

/**
 * The default rows over `[lo, hi]` on an axis `pxPerMs` pixels per
 * millisecond: the finest level-and-step (from {@link AUTO_STEPS}) with at
 * least two cells in the domain whose every cell is wide enough for its
 * label, then that level's parent. `textWidth` measures a label in the
 * axis's font.
 */
export function defaultTimeRows(
  lo: number,
  hi: number,
  zone: string,
  pxPerMs: number,
  textWidth: (s: string) => number
): TimeRow[] {
  const inner = chooseInner(lo, hi, zone, pxPerMs, textWidth);
  const parent = inner.parent;
  return parent === undefined
    ? [{ partition: inner }]
    : [{ partition: inner }, { partition: parent }];
}

function chooseInner(
  lo: number,
  hi: number,
  zone: string,
  pxPerMs: number,
  textWidth: (s: string) => number
): CalendarPartition {
  const span = hi - lo;
  let last: CalendarPartition | undefined;
  for (const [unit, steps] of AUTO_STEPS) {
    for (const step of steps) {
      const p = new CalendarPartition(unit, step);
      last = p;
      // Skip a level far too fine for the domain before listing its cells
      // (a ten-year domain has millions of seconds).
      if (span / nominalMs(unit, step) > 2000) continue;
      const cells = p.cells(lo, hi, zone);
      if (cells.length < 2) continue;
      const fits = cells.every(
        (c) =>
          (c.end - c.start) * pxPerMs >=
          TIME_LABEL_PAD + textWidth(p.label(c, zone)) + LABEL_CLEARANCE
      );
      if (fits) return p;
    }
  }
  return last!;
}

/** About how long one cell of `unit` × `step` lasts, for the cheap
 *  too-many-cells guard only. */
function nominalMs(unit: CalendarUnit, step: number): number {
  const ms: Record<CalendarUnit, number> = {
    second: 1e3,
    minute: 6e4,
    hour: 36e5,
    day: 864e5,
    week: 6048e5,
    month: 2628e6,
    quarter: 7884e6,
    year: 31557e6,
  };
  return ms[unit] * step;
}
