// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Cells (#1058, #48): what `field(x).bin(p)` turns a value into.
 *
 * A PARTITION cuts a line (numbers, or instants on a calendar) into cells that
 * do not overlap. It is one of:
 *
 *  - a Calendar value (`Calendar.month`, `Calendar.hour.every(6)`,
 *    `Calendar.week({ start: "sunday" })`, calendar.ts), for a time column;
 *  - `{ step }`: cells `step` wide, aligned to multiples of `step`;
 *  - `{ thresholds: n }`: about `n` cells, with the step a numeric axis with
 *    `n` ticks would use, so the edges are round numbers;
 *  - `{ thresholds: [t1, t2, ...] }`: cells that end and start at the given
 *    edges, with the domain's ends as the outer edges.
 *
 * A {@link Cell} is one cell: the interval `[start, end)` (its region), an id,
 * and its label. Cells are ordered by their start.
 *
 * The cells of a binned key are defined over a DOMAIN, not over the rows of one
 * group: {@link binCells} takes every value the column has in the chart's data
 * (see `domainRows` in schema.ts), so each group of a split sees the same cells,
 * in the same order, empty cells included. A count-based partition
 * (`{ thresholds: 20 }`) picks its step from that domain too.
 *
 * A cell holds its start and not its end. A Calendar value or a `{ step }`
 * puts every value in the cell that holds it, whatever the domain: March 1
 * is in March. A `{ thresholds }` partition is fitted to the domain, so it
 * covers the domain with its ends included: when the largest value sits on
 * a cell boundary, it falls in the cell that ends there rather than in a new
 * cell of its own, as numpy's `histogram` and d3's `bin` do.
 */
import { tickIncrement } from "d3-array";
import type { Frontend } from "gofish-ir";
import {
  calendarPartition,
  CalendarPartition,
  type CalendarCell,
  type CalendarJSON,
} from "./calendar";

/** A custom label for a numeric partition's cells: a function of the cell. */
export type NumberCellFormat = (cell: Cell) => string;

/** A partition of the number line: `{ step }` or `{ thresholds }`, with an
 *  optional label `format` (JS only: a function has no wire form). */
export type NumberPartition =
  | { step: number; format?: NumberCellFormat }
  | { thresholds: number | number[]; format?: NumberCellFormat };

/** What `field(x).bin(p)` takes: a Calendar value or a numeric partition. */
export type Partition = CalendarPartition | NumberPartition;

/** A partition's wire form: a Calendar value's (`{ unit, step?, start? }`),
 *  `{ step }`, or `{ thresholds }`. */
export type PartitionJSON = Frontend.PartitionIR;

/** One cell of a calendar partition, as a {@link Cell} carries it: the
 *  calendar fields of its start (what a `.format(fn)` reads), the partition it
 *  belongs to, and the zone it was read in. An axis over calendar cells reads
 *  the partition's parent level from it for its outer row. */
export type CalendarCellInfo = {
  fields: CalendarCell;
  partition: CalendarPartition;
  zone: string;
};

/**
 * One cell: the half-open interval `[start, end)` (numbers, or epoch
 * milliseconds for a calendar cell), its label, and, for a calendar cell, its
 * calendar fields. Its id is its start, as text: cells of one partition do not
 * overlap, so no two share a start. A cell stands for itself as a group key:
 * `String(cell)` is its id.
 */
export class Cell {
  constructor(
    readonly start: number,
    readonly end: number,
    /** The text an axis shows for the cell: the partition's format, else the
     *  default ("Jan" for a month, "0.5–1" for numbers). */
    readonly label: string,
    readonly calendar?: CalendarCellInfo
  ) {}

  /** The cell's identity: its start, as text. */
  get id(): string {
    return String(this.start);
  }

  toString(): string {
    return this.id;
  }
}

/** The cells of a partition over a domain, in order, and the cell each value
 *  of the domain falls in. */
export type Cells = {
  readonly cells: readonly Cell[];
  /** The cell `v` falls in, or undefined for a value outside the domain. */
  cellOf(v: number): Cell | undefined;
};

/** Whether `p` is a Calendar value or its wire form. */
const isCalendar = (p: unknown): p is CalendarPartition | CalendarJSON =>
  p instanceof CalendarPartition ||
  (typeof p === "object" && p !== null && "unit" in p);

/** `p` as an error message shows it. */
function describe(p: unknown): string {
  if (p instanceof CalendarPartition) return String(p);
  try {
    return JSON.stringify(p) ?? String(p);
  } catch {
    return String(p);
  }
}

/** The loud error for a value that is not a partition. */
const notAPartition = (where: string, p: unknown): Error =>
  new Error(
    `${where}: expected a partition: a Calendar value (Calendar.month, ` +
      `Calendar.hour.every(6), ...), { step: number }, or { thresholds: ` +
      `number | number[] }; got ${describe(p)}.`
  );

/** Check a partition as the user (or the wire) wrote it, and return it in
 *  its builder form: a CalendarPartition, or a checked numeric partition. */
export function checkPartition(p: unknown, where: string): Partition {
  if (isCalendar(p)) return calendarPartition(p, where);
  if (typeof p !== "object" || p === null) throw notAPartition(where, p);
  const o = p as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => k !== "format");
  if (o.format !== undefined && typeof o.format !== "function") {
    throw new Error(
      `${where}: format must be a function of the cell, (cell) => string.`
    );
  }
  if (keys.length === 1 && keys[0] === "step") {
    if (typeof o.step !== "number" || !Number.isFinite(o.step) || o.step <= 0) {
      throw new Error(
        `${where}: step must be a positive number, got ${describe(o.step)}.`
      );
    }
    return p as NumberPartition;
  }
  if (keys.length === 1 && keys[0] === "thresholds") {
    const t = o.thresholds;
    const count = typeof t === "number" && Number.isInteger(t) && t >= 1;
    const edges =
      Array.isArray(t) &&
      t.length > 0 &&
      t.every((e) => typeof e === "number" && Number.isFinite(e));
    if (!count && !edges) {
      throw new Error(
        `${where}: thresholds must be a whole number of cells (1 or more) ` +
          `or a list of edges, got ${describe(t)}.`
      );
    }
    return p as NumberPartition;
  }
  throw notAPartition(where, p);
}

/** A partition's wire form. A partition with a `format` has none (a loud
 *  error), as a Calendar value with a `.format(fn)` has none. */
export function partitionToJSON(p: Partition): PartitionJSON {
  if (p instanceof CalendarPartition) return p.toJSON();
  if (p.format !== undefined) {
    throw new Error(
      `field(...).bin(${describe(p)}) has no wire form: its format is a JS ` +
        `function, which cannot be serialized (to Python or the IR). Drop ` +
        `the format to use the default labels.`
    );
  }
  return "step" in p ? { step: p.step } : { thresholds: p.thresholds };
}

/** The default partition of `.bin()` with no argument: about 10 cells. */
export const DEFAULT_PARTITION: NumberPartition = { thresholds: 10 };

/** `x` rounded to 12 significant digits, so `3 * 0.1` is 0.3. Cell edges are
 *  computed as multiples of a step, and a step like 0.1 has no exact binary
 *  form. (Numeric axis labels round the same way, `fmtNum`.) */
const round = (x: number): number => +x.toPrecision(12);

/** The default label of a numeric cell: its two edges, "0.5–1". */
const numberLabel = (start: number, end: number): string =>
  `${round(start)}–${round(end)}`;

/** The edges of the cells over `[lo, hi]` for a numeric partition: ascending,
 *  the first at or below `lo`. A step's last edge is above `hi` (the cell
 *  holding `hi` holds its start, not its end); a thresholds partition's last
 *  edge is `hi` or above (it covers the closed domain). */
function numberEdges(p: NumberPartition, lo: number, hi: number): number[] {
  if ("thresholds" in p && Array.isArray(p.thresholds)) {
    // Explicit edges: the domain's ends are the outer edges, and an edge
    // outside the domain cuts nothing.
    const inner = [...new Set(p.thresholds)]
      .filter((t) => t > lo && t < hi)
      .sort((a, b) => a - b);
    return [lo, ...inner, hi];
  }
  // A step, given or picked from the domain as a numeric axis picks its tick
  // step (d3's `tickIncrement`: a whole number, or the inverse of one, so the
  // edges are exact decimals).
  let at: (k: number) => number;
  const isStep = "step" in p;
  if ("step" in p) {
    const step = p.step;
    at = (k) => round(k * step);
  } else {
    const inc = lo === hi ? 1 : tickIncrement(lo, hi, p.thresholds as number);
    at = inc > 0 ? (k) => k * inc : (k) => round(k / -inc);
  }
  // Find the first edge at or below lo by scanning from an estimate, which
  // the rounding above can put one step off.
  const width = at(1) - at(0);
  let k = Math.floor(lo / width);
  while (at(k) > lo) k--;
  while (at(k + 1) <= lo) k++;
  const edges = [at(k)];
  const covered = (e: number) => (isStep ? e > hi : e >= hi);
  while (!covered(edges[edges.length - 1]) || edges.length === 1)
    edges.push(at(++k));
  return edges;
}

/**
 * The cells of partition `p` over the domain `values` (every value the column
 * has in the chart's data; missing values are skipped), in order. `zone` is
 * the column's time zone, for a Calendar partition, which needs a time column.
 * An empty domain has no cells.
 */
export function binCells(
  p: Partition,
  values: readonly unknown[],
  zone: string | undefined,
  where: string
): Cells {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null) continue;
    if (typeof v !== "number" || Number.isNaN(v)) {
      throw new Error(
        `${where}: a binned column must hold numbers${
          p instanceof CalendarPartition ? " (times)" : ""
        }, but it has the value ${describe(v)}.`
      );
    }
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo > hi) return { cells: [], cellOf: () => undefined };

  let cells: Cell[];
  if (p instanceof CalendarPartition) {
    if (zone === undefined) {
      throw new Error(
        `${where}: a Calendar partition bins times, but the column is not a ` +
          `time. Declare it with \`Schema.time()\` in the chart's schema, or ` +
          `pass JS Date values.`
      );
    }
    cells = p.cells(lo, hi, zone).map(
      (c) =>
        new Cell(c.start, c.end, p.label(c, zone), {
          fields: c,
          partition: p,
          zone,
        })
    );
  } else {
    const edges = numberEdges(p, lo, hi);
    const format = p.format;
    cells = edges.slice(0, -1).map((start, i) => {
      const end = edges[i + 1];
      const cell = new Cell(start, end, numberLabel(start, end));
      return format === undefined ? cell : new Cell(start, end, format(cell));
    });
  }

  const last = cells[cells.length - 1];
  const cellOf = (v: number): Cell | undefined => {
    if (v < lo || v > hi) return undefined;
    if (v >= last.start) return last;
    // The last cell whose start is at or below v.
    let a = 0;
    let b = cells.length - 1;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (cells[m].start <= v) a = m;
      else b = m - 1;
    }
    return cells[a];
  };
  return { cells, cellOf };
}
