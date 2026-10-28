// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Cells (#1058, #48): what `field(x).bin(p)` turns a value into.
 *
 * A PARTITION cuts a line (numbers, or instants on a calendar) into cells that
 * do not overlap. It is one of:
 *
 *  - a Calendar value (`Calendar.month`, `Calendar.hour({ every: 6 })`,
 *    `Calendar.week({ start: "sunday" })`, calendar.ts), for a time column;
 *  - `Bin.step(size)`: cells `size` wide, aligned to multiples of `size`;
 *  - `Bin.thresholds(n)`: about `n` cells, with the step a numeric axis with
 *    `n` ticks would use, so the edges are round numbers;
 *  - `Bin.thresholds([t1, t2, ...])`: cells that end and start at the given
 *    edges, with the domain's ends as the outer edges.
 *
 * The two `Bin` kinds are {@link StepBin} and {@link ThresholdsBin}: each is
 * its Bin strategy object, `{ kind, ...params }`, with a `.format(fn)` for
 * its cells' labels, as a Calendar value has one.
 *
 * A {@link Cell} is one cell: the interval `[start, end)` (its region), an id,
 * and its label. Cells are ordered by their start.
 *
 * The cells of a binned key are defined over a DOMAIN, not over the rows of one
 * group: {@link binCells} takes the column's domain, `[lo, hi]`, which its
 * column type carries (`HasDomain` in schema.ts, computed once when the data
 * is typed), so each group of a split sees the same cells, in the same order,
 * empty cells included. A count-based partition (`Bin.thresholds(20)`) picks
 * its step from that domain too.
 *
 * A cell holds its start and not its end. A Calendar value or a `Bin.step`
 * puts every value in the cell that holds it, whatever the domain: March 1
 * is in March. A `Bin.thresholds` partition is fitted to the domain, so it
 * covers the domain with its ends included: when the largest value sits on
 * a cell boundary, it falls in the cell that ends there rather than in a new
 * cell of its own, as numpy's `histogram` and d3's `bin` do.
 */
import { tickIncrement } from "d3-array";
import { Frontend } from "gofish-ir";
import type { Temporal as TemporalNS } from "temporal-polyfill";
import type { HasDomain } from "./schema";
import { kindValue } from "./strategyKind";
import {
  CalendarPartition,
  checkFormat,
  cycleFields,
  describe,
  fieldsOf,
  fromWire,
  noWireForm,
  nominalMs,
  productLabeler,
  referencePeriod,
  zoned,
  type CalendarUnit,
  type CalendarCell,
  type CalendarJSON,
} from "./calendar";

/** A custom label for a numeric partition's cells: a function of the cell. */
export type NumberCellFormat = (cell: Cell) => string;

/**
 * A partition of the number line, made by a call in the `Bin` family
 * (families/bin.ts). Its own keys are its wire form, `{ kind, ...params }`,
 * as for every `Bin` strategy. `.format(fn)` labels its cells; a function
 * cannot be serialized, so a partition with one has no wire form, as a
 * Calendar value with a `.format(fn)` has none.
 */
abstract class NumberBin {
  readonly #format: NumberCellFormat | undefined;

  constructor(format: NumberCellFormat | undefined) {
    this.#format = format;
  }

  /** The cells' custom label, if any (`.format(fn)`); else the default,
   *  the cell's two edges. Not an own key, so the strategy's own keys stay
   *  its wire form. */
  get formatCell(): NumberCellFormat | undefined {
    return this.#format;
  }

  /** The partition's params, without a format. */
  protected abstract wire(): Frontend.FieldBinIR;

  /** The builder spelling, `Bin.step(0.5)`, for error messages. */
  protected abstract spelling(): string;

  /** The wire form. A partition with a `.format(fn)` has none (a loud
   *  error), as for a Calendar value. */
  toJSON(key?: string): Frontend.FieldBinIR {
    if (this.#format !== undefined) throw noWireForm(this, key);
    return this.wire();
  }

  toString(): string {
    return this.#format === undefined
      ? this.spelling()
      : `${this.spelling()}.format(...)`;
  }
}

/** `Bin.step(size)`: cells `size` wide, aligned to multiples of `size`. */
export class StepBin extends NumberBin {
  readonly kind = "step" as const;
  readonly size: number;

  constructor(size: number, format?: NumberCellFormat) {
    super(format);
    this.size = size;
  }

  /** The same cells, labeled by `fn`, a function of the cell. JS only: a
   *  partition with a format has no wire form. */
  format(fn: NumberCellFormat): StepBin {
    return new StepBin(this.size, checkFormat<NumberCellFormat>(this, fn));
  }

  protected wire(): Frontend.FieldBinIR {
    return { kind: "step", size: this.size };
  }

  protected spelling(): string {
    return `Bin.step(${describe(this.size)})`;
  }
}

/** `Bin.thresholds(countOrEdges)`: about `count` cells with round edges, or
 *  the cells between the given edges. */
export class ThresholdsBin extends NumberBin {
  readonly kind = "thresholds" as const;
  readonly thresholds: number | number[];

  constructor(thresholds: number | number[], format?: NumberCellFormat) {
    super(format);
    this.thresholds = thresholds;
  }

  /** The same cells, labeled by `fn`, a function of the cell. JS only: a
   *  partition with a format has no wire form. */
  format(fn: NumberCellFormat): ThresholdsBin {
    return new ThresholdsBin(
      this.thresholds,
      checkFormat<NumberCellFormat>(this, fn)
    );
  }

  protected wire(): Frontend.FieldBinIR {
    return { kind: "thresholds", thresholds: this.thresholds };
  }

  protected spelling(): string {
    return `Bin.thresholds(${describe(this.thresholds)})`;
  }
}

/** A partition of the number line: `Bin.step(size)` or
 *  `Bin.thresholds(countOrEdges)`. */
export type NumberPartition = StepBin | ThresholdsBin;

/** What `field(x).bin(p)` takes: a Calendar value or a numeric partition. */
export type Partition = CalendarPartition | NumberPartition;

/** A partition's wire form, one tagged union: a Calendar value's
 *  (`{ kind: "month", every? }`, `{ kind: "week", every?, start? }`), or a
 *  numeric partition's (`{ kind: "step", size }`,
 *  `{ kind: "thresholds", thresholds }`). */
export type PartitionJSON = Frontend.PartitionIR;

/** One cell of a calendar partition, as a {@link Cell} carries it: the
 *  calendar fields of its start (what a `.format(fn)` reads), the partition it
 *  belongs to, and the zone it was read in. */
export type CalendarCellInfo = {
  fields: CalendarCell;
  partition: CalendarPartition;
  zone: string;
};

/**
 * A group key made by binning (#1058): what every cell shares, whether it
 * has a place in space ({@link RegionCell}) or not ({@link CycleCell}). A
 * cell stands for itself as a group key: `String(cell)` is its id.
 */
export abstract class KeyCell {
  /** The cell's identity among the cells of its key. */
  abstract get id(): string;
  /** The text an axis shows for the cell, when it has one. */
  abstract get label(): string | undefined;
  /** For a cell of a chain of bins (`.bin(Calendar.year).bin(Calendar.month)`),
   *  the cell of the bin before it that holds it: a month's year. */
  declare readonly parent?: KeyCell;
  /** The bin that made the cell, as written (`Calendar.month`,
   *  `[Calendar.year, Calendar.month]`, `Bin.step(0.5)`): an axis names its
   *  levels with it. */
  declare readonly bin?: string;

  toString(): string {
    return this.id;
  }
}

/**
 * A cell of a binned key that has a REGION, as a `partition` places it
 * (#1059): what a cell of a line ({@link Cell}) and a cell of the plane (a
 * `PolygonCell`, polygonCells.ts) share. Everything is in data units.
 */
export abstract class RegionCell extends KeyCell {
  /** The cell's `[min, max]` along `axis`. A cell of a line lies along
   *  whichever axis its column is placed on, so its span is the same on
   *  both. */
  abstract span(axis: 0 | 1): readonly [number, number];
  /** The cell's outline, `[x, y]` per corner, for a cell that is not a box
   *  (a hexagon, a Voronoi cell); undefined for a cell of a line. */
  declare readonly outline?: readonly (readonly [number, number])[];
}

/**
 * One cell of a line: the half-open interval `[start, end)` (numbers, or
 * epoch milliseconds for a calendar cell), its label, and, for a calendar
 * cell, its calendar fields. Its id is its start, as text: cells of one
 * partition do not overlap, so no two share a start.
 */
export class Cell extends RegionCell {
  constructor(
    readonly start: number,
    readonly end: number,
    /** The text an axis shows for the cell: the partition's format, else the
     *  default ("Jan" for a month, "Jun 2015" for a product of a year and a
     *  month, "0.5–1" for numbers). */
    readonly label: string,
    readonly calendar?: CalendarCellInfo,
    readonly parent?: Cell,
    readonly bin?: string
  ) {
    super();
  }

  /** The cell's identity: its start, as text. */
  get id(): string {
    return String(this.start);
  }

  span(): readonly [number, number] {
    return [this.start, this.end];
  }
}

/**
 * The parts of a cycle, what a key binned into them has (#1052): the cells
 * of every part of one cell of `of` (the twelve months of a year), in order,
 * every one of them, whatever the data holds. An axis over the key shows the
 * whole cycle, and its order is the cycle's.
 *
 * TODO(#1052): a cycle has no ends, so a spread over one in polar space
 * should leave the same gap between its last part and its first as between
 * any two; that default is not built yet.
 */
export type HasCycle = {
  /** The cycle's unit, as a partition whose every cell is one cycle:
   *  `Calendar.year` for the months of a year, and for the parts of a week
   *  `Calendar.week` with their week start. Its `unit` is the unit the parts
   *  are parts of. */
  readonly unit: CalendarPartition;
  /** The levels each part is named by, coarsest first: `[Calendar.month]`
   *  for a month of the year, `[Calendar.month, Calendar.day]` for a day of
   *  the year. */
  readonly levels: readonly CalendarPartition[];
  /** Every part, in order. */
  readonly cells: readonly CycleCell[];
};

/**
 * One part of a cycle (a month of the year: `field(x).bin(Calendar.month)`):
 * every instant whose field is that part, in any year, so all Junes are one
 * cell. It has no one place on the time line, so it has no region and a
 * `partition` cannot place it. Its id is its field values, coarsest first
 * ("6" for June, "6-15" for June 15); its `index` is its place in the cycle.
 */
export class CycleCell extends KeyCell {
  /** The cycle the part belongs to, set once all its parts are made. */
  cycle!: HasCycle;

  constructor(
    readonly id: string,
    readonly label: string,
    /** The part's place in its cycle, from 0. */
    readonly index: number,
    /** The part in the reference cycle (`referencePeriod` in calendar.ts):
     *  its `[start, end)`, epoch ms in UTC. An axis level that groups the
     *  parts reads which group each part falls in off it. */
    readonly ref: readonly [number, number],
    readonly parent?: CycleCell,
    readonly bin?: string
  ) {
    super();
  }
}

/** A cell of a binned field: a cell of the line, or a part of a cycle. */
export type AxisCell = Cell | CycleCell;

/** The cells of a key over a domain, in order, and the cell each value of
 *  the domain falls in. */
export type Cells = {
  readonly cells: readonly AxisCell[];
  /** The cell `v` falls in, or undefined for a value outside the domain. */
  cellOf(v: number): AxisCell | undefined;
};

/** Check a partition as the user (or the wire) wrote it, and return it in
 *  its builder form: a CalendarPartition, a {@link StepBin}, or a
 *  {@link ThresholdsBin}. The wire form is told apart by its `kind`
 *  (`Frontend.checkPartition`); a `Bin` kind that bins two fields
 *  (`Bin.hex`) is an error naming `struct({ x, y }).bin`. */
export function checkPartition(given: unknown, where: string): Partition {
  // A Calendar kind used bare is read as its value from here on.
  const p = kindValue(given);
  if (p instanceof CalendarPartition) return p;
  Frontend.checkPartition(p, where);
  if (p instanceof StepBin || p instanceof ThresholdsBin) return p;
  const wire = p as PartitionJSON;
  switch (wire.kind) {
    case "step":
      return new StepBin(wire.size);
    case "thresholds":
      return new ThresholdsBin(wire.thresholds);
    default:
      return fromWire(wire);
  }
}

/**
 * A product of calendar levels, `[Calendar.year, Calendar.month]`: one cell
 * per combination, the cells where one cell of each level meet (the June of
 * 2015). Each level after the first is a part of the one before it (a month
 * is a part of a year), so the cells are the finest level's cells: on the
 * time line when the first level is (`Calendar.year`), and parts of a cycle
 * when it is a part itself (`[Calendar.month, Calendar.day]`, a day of the
 * year). See {@link checkProduct}.
 */
export type Product = readonly CalendarPartition[];

/** One `.bin(...)`: a partition, or a product of calendar levels. */
export type BinStep = Partition | Product;

/** A bin step's wire form: a partition's, or a list of them. */
export type BinStepJSON = PartitionJSON | CalendarJSON[];

/** `step` as an error message, and an axis level, names it. */
export const spell = (step: BinStep): string =>
  Array.isArray(step) ? `[${step.map(String).join(", ")}]` : String(step);

/** A level that is a part of `unit`, for error messages. */
const partExample = (unit: CalendarUnit): string =>
  ({
    year: "Calendar.month",
    month: "Calendar.day",
    day: "Calendar.hour",
    hour: "Calendar.minute",
    minute: "Calendar.second",
    week: "Calendar.weekday",
    weekday: "Calendar.hour",
  })[unit as string] ?? "none: nothing is a part of it";

/** Whether `p`, binned alone or first in a product, gives parts of a
 *  cycle rather than cells of the line: a calendar level that is a part of a
 *  larger one (`Calendar.month`, the month of the year). */
const isPart = (p: Partition): boolean =>
  p instanceof CalendarPartition && p.cycle !== undefined;

/** Whether a key binned by `step` first is binned into the parts of a cycle
 *  (`Calendar.month`, `[Calendar.month, Calendar.day]`), not into cells of
 *  the line (`Calendar.year`, `[Calendar.year, Calendar.month]`,
 *  `Bin.step(1)`). */
export const isCycleStep = (step: BinStep): boolean =>
  isPart(Array.isArray(step) ? step[0] : (step as Partition));

/** The finest level of a step: the last level of a product. */
const finest = (step: BinStep): Partition =>
  Array.isArray(step) ? step[step.length - 1] : (step as Partition);

/**
 * Check a product as written (`[Calendar.year, Calendar.month]`): two or more
 * calendar levels with default labels, each after the first a part of one
 * cell of the one before it ({@link CalendarPartition.whyNotAPart}), so the
 * cells where they meet are each one interval: the June of 2015. A numeric
 * partition has no parts,
 * so it cannot be in a product: numeric cells are split by chaining bins.
 */
function checkProduct(list: readonly unknown[], where: string): Product {
  const at = (i: number) => `${where}[${i}]`;
  if (list.length < 2)
    throw new Error(
      `${where}: a product of bins takes two or more Calendar levels, e.g. ` +
        `[Calendar.year, Calendar.month]. To bin by one level, pass it ` +
        `alone: .bin(Calendar.month).`
    );
  const levels = list.map((p, i) => {
    const q = checkPartition(p, at(i));
    if (!(q instanceof CalendarPartition))
      throw new Error(
        `${at(i)}: ${String(q)} cannot be in a product: a product combines ` +
          `a Calendar level with its parts (a year with its months), and ` +
          `numeric cells have no parts. To split numeric cells, chain the ` +
          `bins: .bin(Bin.step(10)).bin(Bin.step(2)).`
      );
    if (q.formatCell !== undefined)
      throw new Error(
        `${at(i)}: ${String(q)} cannot be in a product: a product's cells ` +
          `are labeled by all its levels at once ("Jun 2015"). Drop the ` +
          `.format(...), and relabel the axis with its levels option, e.g. ` +
          `axes: { x: { levels: [${String(q)}] } }.`
      );
    return q;
  });
  for (let i = 1; i < levels.length; i++) {
    const [prev, next] = [levels[i - 1], levels[i]];
    const why = prev.whyNotAPart(next);
    if (why !== undefined)
      throw new Error(
        `${at(i)}: each level of a product after the first is a part of one ` +
          `cell of the one before it, but ${why}. To split each cell of ` +
          `${String(prev)} by ${String(next)}, chain the bins: ` +
          `.bin(${String(prev)}).bin(${String(next)}).`
      );
  }
  return levels;
}

/** Check one `.bin(...)` argument as the user (or the wire) wrote it: a
 *  partition, or a product of calendar levels (a list). */
export function checkBinStep(p: unknown, where: string): BinStep {
  return Array.isArray(p) ? checkProduct(p, where) : checkPartition(p, where);
}

/**
 * Check a chain of bins (`.bin(Calendar.year).bin(Calendar.month)`): each
 * bin after the first splits each cell of the one before it.
 *
 *  - On the time line (or the number line), the next bin must be finer than
 *    the one before it, and bin the same kind of value (times or numbers).
 *    Its cells are read on the line, so a month in a chain is a month of its
 *    year, and a cell it shares with two parent cells is cut in two (a week
 *    across New Year).
 *  - On a cycle (`.bin(Calendar.month)` first, the month of the year), the
 *    next bin must be a part of the finest level before it, as in a product
 *    (`.bin(Calendar.month).bin(Calendar.day)`: the days of each month of
 *    the year).
 *
 * A product cannot split another bin: put its levels in the chain one at a
 * time.
 */
export function checkChain(steps: readonly BinStep[], where: string): void {
  const cycle = isCycleStep(steps[0]);
  for (let i = 1; i < steps.length; i++) {
    const next = steps[i];
    const prev = finest(steps[i - 1]);
    const say = `${where}: .bin(${spell(steps[i - 1])}).bin(${spell(next)})`;
    if (Array.isArray(next))
      throw new Error(
        `${say}: a product cannot split another bin. Chain its levels one ` +
          `at a time: ${next.map((p) => `.bin(${String(p)})`).join("")}.`
      );
    const p = next as Partition;
    if (cycle) {
      if (
        !(p instanceof CalendarPartition) ||
        !(prev instanceof CalendarPartition) ||
        prev.whyNotAPart(p) !== undefined
      )
        throw new Error(
          `${say}: ${spell(steps[0])} bins into the parts of a cycle (a ` +
            `${(prev as CalendarPartition).unit} of the ` +
            `${(prev as CalendarPartition).cycle}), so each bin after it ` +
            `must be a part of the one before it: a part of a ` +
            `${(prev as CalendarPartition).unit}, such as ` +
            `${partExample((prev as CalendarPartition).unit)}. To bin on ` +
            `the time line instead, start the chain with a level that is ` +
            `a part of nothing, e.g. .bin(Calendar.year).bin(` +
            `${String(finest(steps[0]))}).`
        );
      continue;
    }
    const cal = [prev, p].map((q) => q instanceof CalendarPartition);
    if (cal[0] !== cal[1])
      throw new Error(
        `${say}: a chain bins one column, but a Calendar value bins times ` +
          `and Bin.step and Bin.thresholds bin numbers.`
      );
    const finer =
      prev instanceof CalendarPartition && p instanceof CalendarPartition
        ? nominalMs(p.unit, p.step) < nominalMs(prev.unit, prev.step)
        : prev instanceof StepBin && p instanceof StepBin
          ? p.size < prev.size
          : true;
    if (!finer)
      throw new Error(
        `${say}: each bin in a chain splits the cells of the one before ` +
          `it, so it must be finer, but ${String(p)} is not finer than ` +
          `${String(prev)}.`
      );
  }
}

/** A bin step's wire form. A partition with a format has none (a loud
 *  error), as a Calendar value with a `.format(fn)` has none. */
export const binStepToJSON = (step: BinStep): BinStepJSON =>
  Array.isArray(step)
    ? step.map((p) => p.toJSON())
    : (step as Partition).toJSON();

/** A partition's wire form. A partition with a format has none (a loud
 *  error), as a Calendar value with a `.format(fn)` has none. */
export const partitionToJSON = (p: Partition): PartitionJSON => p.toJSON();

/** The default partition of `.bin()` with no argument: about 10 cells. */
export const DEFAULT_PARTITION: NumberPartition = new ThresholdsBin(10);

/** `x` rounded to 12 significant digits, so `3 * 0.1` is 0.3. Cell edges are
 *  computed as multiples of a step, and a step like 0.1 has no exact binary
 *  form. Numeric axis labels round the same way (`fmtNum`), and so do the
 *  corners of polygon cells (polygonCells.ts). */
export const round12 = (x: number): number => +x.toPrecision(12);

/** The default label of a numeric cell: its two edges, "0.5–1". */
const numberLabel = (start: number, end: number): string =>
  `${round12(start)}–${round12(end)}`;

/** The edges of the cells over `[lo, hi]` for a numeric partition: ascending,
 *  the first at or below `lo`. A step's last edge is above `hi` (the cell
 *  holding `hi` holds its start, not its end); a thresholds partition's last
 *  edge is `hi` or above (it covers the closed domain). */
function numberEdges(p: NumberPartition, lo: number, hi: number): number[] {
  if (p.kind === "thresholds" && Array.isArray(p.thresholds)) {
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
  const isStep = p.kind === "step";
  if (p.kind === "step") {
    const step = p.size;
    at = (k) => round12(k * step);
  } else {
    const inc = lo === hi ? 1 : tickIncrement(lo, hi, p.thresholds as number);
    at = inc > 0 ? (k) => k * inc : (k) => round12(k / -inc);
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

/** The cells of one bin step over `[lo, hi]` on the line: a Calendar
 *  value's cells (as the time line holds them: a month is a month of its
 *  year), a product's (its finest level's cells, labeled by every level), or
 *  a numeric partition's. */
function lineCells(
  step: BinStep,
  lo: number,
  hi: number,
  zone: string | undefined
): Cell[] {
  const bin = spell(step);
  if (Array.isArray(step) || step instanceof CalendarPartition) {
    const levels: Product = Array.isArray(step) ? step : [step];
    const leaf = levels[levels.length - 1];
    const product =
      levels.length === 1 ? undefined : productLabeler(levels, zone!);
    return leaf
      .cells(lo, hi, zone!)
      .map(
        (c) =>
          new Cell(
            c.start,
            c.end,
            product === undefined ? leaf.label(c, zone!) : product(c.start),
            { fields: c, partition: leaf, zone: zone! },
            undefined,
            bin
          )
      );
  }
  const p = step as NumberPartition;
  const edges = numberEdges(p, lo, hi);
  return edges
    .slice(0, -1)
    .map((start, i) => numberCell(p, start, edges[i + 1], bin));
}

/** A numeric cell `[start, end)` of `p`, labeled by its format or its two
 *  edges. */
function numberCell(
  p: NumberPartition,
  start: number,
  end: number,
  bin: string,
  parent?: Cell
): Cell {
  const cell = new Cell(
    start,
    end,
    numberLabel(start, end),
    undefined,
    parent,
    bin
  );
  return p.formatCell === undefined
    ? cell
    : new Cell(start, end, p.formatCell(cell), undefined, parent, bin);
}

/**
 * Split each of `parents` (cells of the line, in order) by the cells of `p`
 * over the same domain: one cell where each parent meets each of `p`'s
 * cells, holding its parent. A cell of `p` across a parent's edge is cut in
 * two, each part labeled as a cell that starts there.
 */
function refine(
  parents: readonly Cell[],
  p: Partition,
  lo: number,
  hi: number,
  zone: string | undefined
): Cell[] {
  const children = lineCells(p, lo, hi, zone);
  const bin = spell(p);
  const out: Cell[] = [];
  let j = 0;
  for (const parent of parents) {
    while (j < children.length && children[j].end <= parent.start) j++;
    for (
      let k = j;
      k < children.length && children[k].start < parent.end;
      k++
    ) {
      const c = children[k];
      const start = Math.max(c.start, parent.start);
      const end = Math.min(c.end, parent.end);
      if (start >= end) continue;
      if (start === c.start && end === c.end) {
        out.push(new Cell(start, end, c.label, c.calendar, parent, bin));
      } else if (p instanceof CalendarPartition) {
        const fields = fieldsOf(zoned(start, zone!), end, p.unit);
        out.push(
          new Cell(
            start,
            end,
            p.label(fields, zone!),
            { fields, partition: p, zone: zone! },
            parent,
            bin
          )
        );
      } else {
        out.push(numberCell(p as NumberPartition, start, end, bin, parent));
      }
    }
  }
  return out;
}

/** The cell of `cells` (cells of the line, in order, end to end over the
 *  domain `[lo, hi]`) that holds `v`: the last whose start is at or below
 *  it. The domain's top value is in the last cell (see the module
 *  comment). */
function lineCellOf(
  cells: readonly Cell[],
  lo: number,
  hi: number
): (v: number) => Cell | undefined {
  const last = cells[cells.length - 1];
  return (v) => {
    if (v < lo || v > hi || last === undefined) return undefined;
    if (v >= last.start) return last;
    let a = 0;
    let b = cells.length - 1;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (cells[m].start <= v) a = m;
      else b = m - 1;
    }
    return cells[a];
  };
}

/**
 * The parts of a cycle that a chain of bins whose first bin is a part
 * (`Calendar.month`, the month of the year) gives, and the part each instant
 * of `[lo, hi]` (read in `zone`) falls in. The parts are read off one cell of
 * the cycle unit, the reference cycle (`referencePeriod`: the leap year 2000
 * for parts of a year, so February 29 is one), so a key over them has every
 * part, empty ones included. Each level of the chain (a bin step) names a
 * part by the field values of its levels so far, coarsest first, and each
 * part holds the part of the level before it that holds it.
 */
function cycleCells(
  steps: readonly BinStep[],
  lo: number,
  hi: number,
  zone: string
): Cells {
  const levels: CalendarPartition[] = steps.flatMap((s): CalendarPartition[] =>
    Array.isArray(s) ? [...s] : [s as CalendarPartition]
  );
  const of = levels[0].cycle!;
  // A week's parts keep its start (a weekday of a week that starts on
  // Sunday is a part of that week).
  const unit = new CalendarPartition(
    of,
    1,
    of === "week" ? levels[0].start : undefined
  );
  const [rlo, rhi] = referencePeriod(of, levels[0].start);
  const leaf = levels[levels.length - 1];
  // Each reference cell, with the id it has after each number of levels:
  // its levels' parts so far, coarsest first, joined (`ids[n]`).
  const reference = leaf
    .cells(rlo, rhi - 1, "UTC")
    .filter((c) => c.start >= rlo && c.start < rhi)
    .map((c) => ({ c, ids: prefixIds(levels, zoned(c.start, "UTC")) }));
  // How many levels each step has named so far.
  const depth: number[] = [];
  steps.reduce((n, s) => {
    depth.push(n + (Array.isArray(s) ? s.length : 1));
    return depth[depth.length - 1];
  }, 0);
  let parents = new Map<string, CycleCell>();
  let cells: CycleCell[] = [];
  steps.forEach((step, k) => {
    const n = depth[k];
    const byId = new Map<string, CycleCell>();
    const made: CycleCell[] = [];
    const ends = new Map<string, number>();
    const product = Array.isArray(step)
      ? productLabeler(step, "UTC")
      : undefined;
    for (const { c, ids } of reference) {
      const id = ids[n];
      ends.set(id, c.end);
      if (byId.has(id)) continue;
      const label =
        product !== undefined
          ? product(c.start)
          : (step as CalendarPartition).partLabel(
              cycleFields(c.start, (step as CalendarPartition).unit, of),
              c.start
            );
      const cell = new CycleCell(
        id,
        label,
        made.length,
        [c.start, c.end],
        k === 0 ? undefined : parents.get(ids[depth[k - 1]]),
        spell(step)
      );
      byId.set(id, cell);
      made.push(cell);
    }
    const cycle: HasCycle = {
      unit,
      levels: levels.slice(0, n),
      cells: made.map(
        (c) =>
          // A part spans its reference cells end to end.
          new CycleCell(
            c.id,
            c.label,
            c.index,
            [c.ref[0], ends.get(c.id)!],
            c.parent,
            c.bin
          )
      ),
    };
    for (const c of cycle.cells) c.cycle = cycle;
    parents = new Map(cycle.cells.map((c) => [c.id, c]));
    cells = cycle.cells as CycleCell[];
  });
  const leaves = new Map(cells.map((c) => [c.id, c]));
  // Reading an instant's part takes a time-zone conversion and a floor per
  // level, so each distinct value is read once: the map grows only to the
  // values the column holds.
  const partOf = new Map<number, CycleCell | undefined>();
  return {
    cells,
    cellOf: (v) => {
      if (v < lo || v > hi) return undefined;
      if (!partOf.has(v))
        partOf.set(
          v,
          leaves.get(prefixIds(levels, zoned(v, zone))[levels.length])
        );
      return partOf.get(v);
    },
  };
}

/** The id the instant `z` has after each number of `levels`: `ids[n]` is
 *  its first `n` levels' parts, coarsest first, joined with "-" ("6" for
 *  June, "6-15" for June 15). */
function prefixIds(
  levels: readonly CalendarPartition[],
  z: TemporalNS.ZonedDateTime
): string[] {
  const ids = [""];
  levels.forEach((p, i) =>
    ids.push(i === 0 ? String(p.part(z)) : `${ids[i]}-${p.part(z)}`)
  );
  return ids;
}

/**
 * The cells of a key binned by `steps` (`field(x).bin(...)`, once per
 * step) over `domain`, the column's domain (`HasDomain`, schema.ts), in
 * order: the leaves of the chain, each holding its cell of the bin before
 * it. `zone` is the column's time zone, for a Calendar value, which needs a
 * time column. No domain (a column with no values) has no cells.
 *
 *  - A first bin that is a part (`Calendar.month`, or a product that starts
 *    with one) bins into the parts of a cycle ({@link cycleCells}): every
 *    part, whatever the domain.
 *  - Otherwise the first bin's cells are the cells of the line that meet
 *    the domain, and each further bin splits them ({@link refine}).
 */
export function chainCells(
  steps: readonly BinStep[],
  domain: HasDomain | undefined,
  zone: string | undefined,
  where: string
): Cells {
  checkChain(steps, where);
  const calendar = steps.some(
    (s) => Array.isArray(s) || s instanceof CalendarPartition
  );
  if (domain === undefined) return { cells: [], cellOf: () => undefined };
  const { lo, hi } = domain;
  if (calendar && zone === undefined) {
    throw new Error(
      `${where}: a Calendar partition bins times, but the column is not a ` +
        `time. Declare its unit as \`Unit.time()\` in the chart's schema, or ` +
        `pass JS Date values.`
    );
  }
  if (isCycleStep(steps[0])) return cycleCells(steps, lo, hi, zone!);
  let cells = lineCells(steps[0], lo, hi, zone);
  for (const step of steps.slice(1))
    cells = refine(cells, step as Partition, lo, hi, zone);
  return { cells, cellOf: lineCellOf(cells, lo, hi) };
}

/** The cells of one bin step over `domain` (see {@link chainCells}). */
export const binCells = (
  step: BinStep,
  domain: HasDomain | undefined,
  zone: string | undefined,
  where: string
): Cells => chainCells([step], domain, zone, where);

/** Whether every one of `cells` is a cell of the line. */
export const allLineCells = (
  cells: readonly AxisCell[]
): cells is readonly Cell[] => cells.every((c) => c instanceof Cell);
