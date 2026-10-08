// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { StackOrigin } from "./constraints/distribute";
import { copyMeasureProvenance } from "./data";
import { loadTemporal, temporal } from "./calendar";

/**
 * Column types (#984): `chart(data, { schema })` declares, per column, the
 * classes (capabilities) its values have, in the style of typeclasses. The
 * engine reasons over the classes, never over the builder words that declare
 * them:
 *
 *  - {@link HasOrder}: the column's values are the levels of a fixed order.
 *    Declared with `Schema.ordered(levels)`. Every `by` split over the column
 *    lays its groups out in that order, and a categorical color scale over it
 *    lists its domain in that order.
 *  - {@link HasMidpoint}: the order has a midpoint, a point along it.
 *    Declared with `.diverging()`, which exists only after `.ordered(...)`
 *    because a midpoint is a point along an order. A stack over the column
 *    puts its origin (its 0) at the midpoint.
 *  - {@link HasCalendar}: the column's values are instants that read on a
 *    calendar in a time zone. Declared with `Schema.time()`, or inferred from
 *    JS `Date` values. The values become epoch milliseconds (UTC) when the
 *    schema is applied, and an axis over them is a time axis whose ticks are
 *    calendar cells (calendar.ts). A time has no zero.
 *
 * A column type is a record keyed by class name, so a later class (`HasZero`,
 * `HasCycle`, ...) is one more optional key. The record is also the wire form:
 * `ColumnSchema#toJSON` writes it, and `chart` accepts it as is (that is what
 * arrives from Python).
 *
 * The types ride the chart's data ARRAY under {@link COLUMN_TYPES}, the way a
 * transform's measure provenance does (`MEASURE_PROVENANCE` in data.ts), so an
 * operator reads a column's type off the data it splits.
 * TODO(#994): measure provenance is the unit part of this record; merge the
 * two symbols.
 */

/** One level of an ordered column. */
export type Level = string | number;

/** The class of a column whose values are the levels of a fixed order, first
 *  to last. */
export type HasOrder = { levels: readonly Level[] };

/** The class of an ordered column whose order has a midpoint: the point `at`
 *  along the order, in edge coordinates. 0 is the first level's leading
 *  edge, `n` is the last level's trailing edge (`n` levels), and level `i`
 *  spans `[i, i + 1]`, so 2.25 has two levels and a quarter of the third
 *  before it. `.diverging()` defaults it to `n / 2`: the middle of the middle
 *  level when `n` is odd, the boundary between the two middle levels when it
 *  is even. It requires {@link HasOrder}, and `0 <= at <= n`. */
export type HasMidpoint = { at: number };

/** The class of a column whose values are instants (`Schema.time()`): epoch
 *  milliseconds, UTC, read on the calendar of the IANA time zone `zone`
 *  (`"UTC"` by default). The zone decides where calendar cells start (a day
 *  starts at local midnight) and how labels read. An instant has no zero. */
export type HasCalendar = { zone: string };

/** A column's type: the classes it has, keyed by class name. */
export type ColumnType = {
  HasOrder?: HasOrder;
  HasMidpoint?: HasMidpoint;
  HasCalendar?: HasCalendar;
};

/** The column types of a dataset, keyed by column name. */
export type ColumnTypes = Record<string, ColumnType>;

/**
 * A column type under construction. Each builder method adds one class, and a
 * method that needs a class already present says so in its `this` type, so a
 * missing prerequisite is a type error: `.diverging()` needs `HasOrder`.
 */
export class ColumnSchema<C extends ColumnType = ColumnType> {
  constructor(public readonly type: C) {}

  /** Give the column a midpoint (`HasMidpoint`) at `midpoint`, in edge
   *  coordinates over its order. The default is the middle of the order,
   *  `n / 2` for `n` levels. A midpoint that is not a number from 0 to `n`
   *  throws here. */
  diverging(
    this: ColumnSchema<C & { HasOrder: HasOrder }>,
    { midpoint }: { midpoint?: number } = {}
  ): ColumnSchema<C & { HasOrder: HasOrder; HasMidpoint: HasMidpoint }> {
    const { levels } = this.type.HasOrder;
    const at = midpoint ?? levels.length / 2;
    checkMidpointOnOrder(levels, at);
    return new ColumnSchema({ ...this.type, HasMidpoint: { at } });
  }

  toJSON(): C {
    return this.type;
  }
}

/** Factories for column types, used in `chart(data, { schema })`. */
export const Schema = {
  /** A column whose values are `levels`, in this order (`HasOrder`). */
  ordered(levels: readonly Level[]): ColumnSchema<{ HasOrder: HasOrder }> {
    return new ColumnSchema({ HasOrder: { levels: [...levels] } });
  },
  /** A column whose values are instants (`HasCalendar`), read on the
   *  calendar of `zone` (an IANA time zone, `"UTC"` by default). A value may
   *  be an ISO 8601 string ("2024-03-05" is the start of that day in `zone`;
   *  a string without an offset is a wall-clock time in `zone`), a `Date`,
   *  or epoch milliseconds. */
  time({ zone = "UTC" }: { zone?: string } = {}): ColumnSchema<{
    HasCalendar: HasCalendar;
  }> {
    return new ColumnSchema({ HasCalendar: { zone } });
  },
};

/** What `chart`'s `schema` option takes per column: a builder, or the record
 *  it writes (the wire form). */
export type SchemaEntry = ColumnSchema<ColumnType> | ColumnType;

/** The record a schema entry stands for, checked for the prerequisites the
 *  builder enforces in its types (a record from the wire, as Python sends it,
 *  has no types) and for a midpoint on its order, with the same check
 *  `.diverging()` runs. */
export function columnTypeOf(column: string, entry: SchemaEntry): ColumnType {
  const type = entry instanceof ColumnSchema ? entry.type : entry;
  if (type.HasMidpoint === undefined) return type;
  if (!type.HasOrder) {
    throw new Error(
      `schema: column "${column}" has HasMidpoint but no HasOrder. A ` +
        `midpoint is a point along an order; declare the order with ` +
        `\`Schema.ordered(levels)\` before \`.diverging()\`.`
    );
  }
  checkMidpointOnOrder(type.HasOrder.levels, type.HasMidpoint.at);
  return type;
}

/** The loud error for a midpoint off its order: `at` must be a finite number
 *  from 0 to `n`, for `n` levels. Python's `ColumnSchema.diverging` raises
 *  the same two messages, word for word. */
function checkMidpointOnOrder(levels: readonly Level[], at: unknown): void {
  const n = levels.length;
  const order = `the edges of the order [${levels.map(showLevel).join(", ")}]`;
  if (typeof at !== "number" || !Number.isFinite(at)) {
    throw new Error(
      `diverging: midpoint must be a finite number from 0 to ${n}, ${order}.`
    );
  }
  if (at < 0 || at > n) {
    throw new Error(
      `diverging: midpoint ${String(at)} is outside 0..${n}, ${order}.`
    );
  }
}

/**
 * Well-known symbol under which a data ARRAY carries its column types. It
 * rides the array, not each row, and is non-enumerable, like
 * `MEASURE_PROVENANCE`.
 */
export const COLUMN_TYPES: unique symbol = Symbol.for("gofish.columnTypes");

/** The column types a data array carries, if any. */
export const getColumnTypes = (data: unknown): ColumnTypes | undefined =>
  data != null
    ? ((data as any)[COLUMN_TYPES] as ColumnTypes | undefined)
    : undefined;

/** The type of `column` in `data`, if the data declares one. */
export const columnType = (
  data: unknown,
  column: string | undefined
): ColumnType | undefined =>
  column === undefined ? undefined : getColumnTypes(data)?.[column];

/** Tag a data array with column types. */
export const setColumnTypes = <T>(data: T, types: ColumnTypes): T => {
  Object.defineProperty(data, COLUMN_TYPES, {
    value: types,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return data;
};

/** Copy `source`'s column types onto `target` (both arrays), for every
 *  column `target` does not type itself. A split leaf or a derive's result is
 *  a fresh array, so it has to be told. */
export const copyColumnTypes = <T>(target: T, source: unknown): T => {
  const types = getColumnTypes(source);
  if (types === undefined) return target;
  const own = getColumnTypes(target);
  return setColumnTypes(
    target,
    own === undefined ? types : { ...types, ...own }
  );
};

const showLevel = (level: unknown): string =>
  typeof level === "string" ? JSON.stringify(level) : String(level);

/** The loud error for values of an ordered column that its order does not
 *  list. The user defines the order, so GoFish never guesses where a stray
 *  level goes. */
export function strayLevelsError(column: string, strays: unknown[]): Error {
  return new Error(
    `schema: column "${column}" has ${strays.length === 1 ? "a value" : "values"} ` +
      `outside its order: ${strays.map(showLevel).join(", ")}. HasOrder ` +
      `(declared with \`Schema.ordered(levels)\`) lists every level of the ` +
      `column, so add ${strays.length === 1 ? "it" : "them"} to the levels or ` +
      `filter those rows out.`
  );
}

/**
 * Type `rows` with `schema`: a copy of the array carrying the column types
 * and the measure provenance it carries. The types are `inherited` (an
 * operator's input's, for its result), then the ones the array already
 * carries, then `schema`'s, each winning over the one before. The copy leaves
 * the caller's array untagged, so one array can feed charts with different
 * schemas.
 *
 * A column the schema does not name is a time column (`HasCalendar`, UTC)
 * when its first non-null value is a JS `Date` (a column is a key of the
 * first row): inference is local, from the value alone, and a missing value
 * says nothing about the column. Strings and numbers are never inferred as time; they need
 * `Schema.time()`. Every time column's values become epoch milliseconds (see
 * {@link toEpochMs}); the rows are copied only when some value is not one
 * already.
 *
 * It does not check the values against an order: a value outside an order is
 * an error where the order is used (`orderByLevels`), so a `filter` in the
 * flow can drop it first.
 */
export async function applySchema<T>(
  rows: T[],
  schema: Record<string, SchemaEntry> = {},
  inherited?: ColumnTypes
): Promise<T[]> {
  const types: ColumnTypes = { ...inherited, ...getColumnTypes(rows) };
  for (const [column, entry] of Object.entries(schema)) {
    types[column] = columnTypeOf(column, entry);
  }
  const first = rows.find((r) => r != null) as
    | Record<string, unknown>
    | undefined;
  for (const column of Object.keys(first ?? {})) {
    if (types[column] !== undefined) continue;
    const v = rows.find(
      (r) => r != null && (r as Record<string, unknown>)[column] != null
    ) as Record<string, unknown> | undefined;
    if (v?.[column] instanceof Date) {
      types[column] = { HasCalendar: { zone: "UTC" } };
    }
  }
  if (Object.keys(types).length === 0) return rows;
  const timeColumns = Object.entries(types).filter(
    ([, t]) => t.HasCalendar !== undefined
  );
  const isEpochMs = (row: T): boolean =>
    row == null ||
    typeof row !== "object" ||
    timeColumns.every(([column]) => {
      const v = (row as Record<string, unknown>)[column];
      return v == null || (typeof v === "number" && Number.isFinite(v));
    });
  let out: T[] = [...rows];
  if (timeColumns.length > 0) {
    await loadTemporal();
    for (const [column, t] of timeColumns)
      checkZone(column, t.HasCalendar!.zone);
  }
  if (!rows.every(isEpochMs)) {
    // Long-format data repeats its dates, so each string is parsed once per
    // zone (for this call only).
    const parsed = new Map<string, unknown>();
    const epochMs = (v: unknown, zone: string, column: string): unknown => {
      if (typeof v !== "string") return toEpochMs(v, zone, column);
      const key = `${zone}\n${v}`;
      if (!parsed.has(key)) parsed.set(key, toEpochMs(v, zone, column));
      return parsed.get(key);
    };
    out = rows.map((row) => {
      if (row == null || typeof row !== "object") return row;
      const copy = { ...(row as Record<string, unknown>) };
      for (const [column, t] of timeColumns) {
        if (column in copy) {
          copy[column] = epochMs(copy[column], t.HasCalendar!.zone, column);
        }
      }
      return copy as T;
    });
  }
  return setColumnTypes(copyMeasureProvenance(out, rows), types);
}

/** The zones {@link checkZone} has found valid. */
const knownZones = new Set<string>();

/** The loud error for a time zone Temporal does not know. */
function checkZone(column: string, zone: string): void {
  if (knownZones.has(zone)) return;
  try {
    temporal().Now.zonedDateTimeISO(zone);
    knownZones.add(zone);
  } catch {
    throw new Error(
      `schema: column "${column}" has the time zone ${JSON.stringify(zone)}, ` +
        `which is not an IANA time zone (e.g. "UTC", "America/New_York").`
    );
  }
}

const DATE_ONLY = /^[+-]?\d{4,6}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)(?:\[.*\])?$/;

/**
 * One value of a time column as epoch milliseconds (UTC). A number is already
 * one; a `Date` is its time; a string is ISO 8601: a date alone is the start
 * of that day in `zone`, a date-time with an offset (`Z`, `+05:00`) is that
 * instant, and a date-time without one is that wall-clock time in `zone`.
 * Missing values (null, undefined) stay missing. Anything else is a loud
 * error naming the column.
 */
export function toEpochMs(v: unknown, zone: string, column: string): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.getTime();
  if (typeof v === "string") {
    const T = temporal();
    const s = v.trim();
    try {
      if (DATE_ONLY.test(s)) {
        return T.PlainDate.from(s).toZonedDateTime({ timeZone: zone })
          .epochMilliseconds;
      }
      if (HAS_OFFSET.test(s) && /\d[T ]\d/.test(s)) {
        return T.Instant.from(s.replace(" ", "T")).epochMilliseconds;
      }
      return T.PlainDateTime.from(s.replace(" ", "T")).toZonedDateTime(zone)
        .epochMilliseconds;
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(
    `schema: column "${column}" is a time (Schema.time()), but has the value ` +
      `${typeof v === "string" ? JSON.stringify(v) : String(v)}, which is not ` +
      `an ISO 8601 date or date-time ("2024-03-05", "2024-03-05T14:30:00Z"), ` +
      `a Date, or epoch milliseconds.`
  );
}

/** Each level of `order`, mapped to its rank (its index in the order). */
const levelRanks = (order: HasOrder): Map<unknown, number> =>
  new Map(order.levels.map((level, i) => [level, i]));

/** `keys` in the order of `order`'s levels. A key the order does not list is
 *  a stray level (a loud error). */
export function orderByLevels<K>(
  column: string,
  order: HasOrder,
  keys: K[]
): K[] {
  const rank = levelRanks(order);
  const strays = keys.filter((k) => !rank.has(k));
  if (strays.length > 0) throw strayLevelsError(column, strays);
  return [...keys].sort((a, b) => rank.get(a)! - rank.get(b)!);
}

/**
 * The {@link StackOrigin} of a stack over `column`, its part a child index,
 * whose children are the groups `keys` (in child order, laid out reversed
 * when `reverse`): the midpoint of the column's order, when the column has
 * {@link HasMidpoint}; else undefined (the default origin). `split` is every
 * level of the order, in the order the split puts groups in (the level order
 * after any `field(...).sort()` or `.reverse()`), and `keys` are the levels
 * the data has, in that order.
 *
 * The midpoint is defined by the ORDER, not by the parts present: a group the
 * data lacks moves nothing. Level `i` spans `[i, i + 1]` in the midpoint's
 * edge coordinates. When the midpoint falls inside a level whose part is
 * present, the origin is that far through the part. Otherwise it falls on a
 * boundary between present parts (a level edge, or a level the data lacks):
 * the tail of the first part laid out past it, or the head of the last part
 * when every part lies before it. A stack that lays the order out against
 * its levels measures the fraction from the other end, so the midpoint `at`
 * lands at `n - at` along the layout. The side of the midpoint a level lands
 * on comes from `split`, not from the parts present, so a row with one part
 * puts it where a row with every part does.
 */
export function stackOrigin(
  column: string | undefined,
  type: ColumnType | undefined,
  split: unknown[],
  keys: unknown[],
  reverse = false
): StackOrigin<number> | undefined {
  if (column === undefined || !type?.HasMidpoint || keys.length === 0)
    return undefined;
  const rank = levelRanks(type.HasOrder!);
  const midpoint = type.HasMidpoint.at;
  // The order's ranks as the stack lays the levels out: along the order (+1)
  // or against it (−1). It must be one or the other, or "before the
  // midpoint" is not a prefix.
  const laidOut = (reverse ? [...split].reverse() : split).map(
    (level) => rank.get(level)!
  );
  const dir = laidOut.length > 1 ? Math.sign(laidOut[1] - laidOut[0]) : 1;
  for (let p = 1; p < laidOut.length; p++) {
    if (Math.sign(laidOut[p] - laidOut[p - 1]) !== dir) {
      throw new Error(
        `stack({ by: "${column}" }): a centered stack lays its parts out in ` +
          `the order of "${column}" (or its reverse), but its \`by\` puts ` +
          `the levels in the order ${split.map(showLevel).join(", ")}. ` +
          `HasMidpoint (declared with \`.diverging()\`) puts the stack's 0 at ` +
          `a point along that order, which needs the parts on each side of ` +
          `it together. Drop the reordering of "${column}".`
      );
    }
  }
  // The parts present, in layout order.
  const order = keys.map((_, i) => (reverse ? keys.length - 1 - i : i));
  const ranks = order.map((i) => rank.get(keys[i])!);
  const at = (p: number, fraction: number): StackOrigin<number> => ({
    part: order[p],
    fraction,
    mirrored: true,
  });
  for (let p = 0; p < ranks.length; p++) {
    // The part's level spans [r, r + 1] along the order. Laid out against
    // the order, its tail is at r + 1.
    const r = ranks[p];
    if (r < midpoint && midpoint < r + 1)
      return at(p, dir > 0 ? midpoint - r : r + 1 - midpoint);
    // The first part laid out past the midpoint: the midpoint is its tail.
    if (dir > 0 ? r >= midpoint : r + 1 <= midpoint) return at(p, 0);
  }
  // Every part lies before the midpoint: it is the last part's head.
  return at(ranks.length - 1, 1);
}
