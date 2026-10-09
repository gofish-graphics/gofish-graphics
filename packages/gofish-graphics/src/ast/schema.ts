// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { StackOrigin } from "./constraints/distribute";
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
 *    calendar cells (calendar.ts). A time has no zero. Its unit is an
 *    instant, so two time columns may share an axis.
 *  - {@link HasUnit}: the column's values are amounts. Declared with
 *    `Schema.unit(unit)`, which says what unit they are in; without it a
 *    column's unit is unknown and unifies with any other (`measure.ts`). A
 *    transform writes it for the columns it makes: `bin()` says its
 *    `start`/`end`/`size` are amounts of its source column's quantity, in
 *    the source's unit, and its `count` is a count.
 *
 * A column type is a record keyed by class name, so a later class (`HasZero`,
 * `HasCycle`, ...) is one more optional key. The record is also the wire form:
 * `ColumnSchema#toJSON` writes it, and `chart` accepts it as is (that is what
 * arrives from Python).
 *
 * The types ride the chart's data ARRAY under {@link COLUMN_TYPES}, so an
 * operator reads a column's type off the data it splits.
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

/** The class of a column whose values are amounts of a quantity:
 *
 *  - `unit`: the declared unit (`Schema.unit("USD")`). Two declared units
 *    that differ never share an axis. Absent: the unit is unknown, a unit
 *    variable that unifies with any unit (`measure.ts`).
 *  - `quantity`: the name of the quantity, when it is not the column's own
 *    name: `bin()`'s `start` is an amount of its source column's quantity.
 *    The quantity names the axis title and the unit variable.
 */
export type HasUnit = { unit?: string; quantity?: string };

/** A column's type: the classes it has, keyed by class name. */
export type ColumnType = {
  HasOrder?: HasOrder;
  HasMidpoint?: HasMidpoint;
  HasCalendar?: HasCalendar;
  HasUnit?: HasUnit;
};

/** Whether `v` is a time column's value as the engine reads it: epoch
 *  milliseconds, a finite number, or missing (null, undefined). */
const isEpochMs = (v: unknown): boolean =>
  v == null || (typeof v === "number" && Number.isFinite(v));

/** Which values each class accepts as they stand, without reinterpreting
 *  them. A missing value (null, undefined) fits every class.
 *
 *  - `HasCalendar`: an instant: epoch milliseconds (a finite number) or a
 *    valid `Date`. A `Date` is an instant, so turning it into epoch
 *    milliseconds reinterprets nothing; a string is not one, since reading
 *    it needs a zone (only a `schema` annotation converts strings).
 *  - `HasOrder`: text or numbers, the kinds its levels are. A value outside
 *    the levels still fits, so the order stays and its stray-level error
 *    fires where the order is used.
 *  - `HasMidpoint`: anything; its values are its order's.
 *  - `HasUnit`: numbers, the amounts the unit measures. */
const ACCEPTS: { [K in keyof ColumnType]-?: (v: unknown) => boolean } = {
  HasCalendar: (v) =>
    isEpochMs(v) || (v instanceof Date && Number.isFinite(v.getTime())),
  HasOrder: (v) => v == null || typeof v === "string" || typeof v === "number",
  HasMidpoint: () => true,
  HasUnit: (v) => v == null || typeof v === "number",
};

const CLASSES = Object.keys(ACCEPTS) as (keyof ColumnType)[];

/** Whether one value fits a column type as it stands, as a predicate built
 *  once per column: every class the type has accepts it ({@link ACCEPTS}). */
function fitsType(type: ColumnType): (v: unknown) => boolean {
  const accepts = CLASSES.filter((k) => type[k] !== undefined).map(
    (k) => ACCEPTS[k]
  );
  return (v) => accepts.every((accept) => accept(v));
}

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
  /** A column whose values are amounts in the unit `unit` (`HasUnit`), an
   *  opaque name such as `"USD"` or `"mm"`. Columns in the same unit may
   *  share an axis; two different units on one axis are an error. A column
   *  with no unit declared may share an axis with any other. */
  unit(unit: string): ColumnSchema<{ HasUnit: HasUnit }> {
    return new ColumnSchema({ HasUnit: { unit } });
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
 * rides the array, not each row, and is non-enumerable, so it never leaks
 * into a `{...d}` spread.
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
 *  column `target` does not type itself. A split leaf or a filter's result is
 *  a fresh array, so it has to be told. Without it, a mark channel over a
 *  split leaf would lose its column's order, time, and unit (a bin's `start`
 *  would fall back to the quantity "start", see `resolveQuantity`). */
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
      `column, so add ${strays.length === 1 ? "it" : "them"} to the levels, ` +
      `filter those rows out, or, if a derive changed the values, annotate ` +
      `the derive's result type with \`derive(fn, { schema })\`.`
  );
}

/**
 * Type `rows` with `schema`: a copy of the array carrying the column types.
 * The types are, each winning over the one before:
 *
 *  1. `inherited` (an operator's input's, for its result), each kept only
 *     when every value of its column fits it as it stands
 *     ({@link ACCEPTS}). The inherited types never reinterpret or check the
 *     values: a column that no longer fits (a date rewritten to "Mar") just
 *     has no type. A column the rows do not hold fits (it has no values).
 *     A time column of `Date`s fits its inherited time, zone and all, and
 *     its Dates become epoch milliseconds below. Fitting reads values, not
 *     meanings: a time recoded to plain numbers (years) still fits, since
 *     any finite number is epoch milliseconds (#1089); `schema` fixes it.
 *  2. The types the array already carries.
 *  3. `schema`'s.
 *
 * A column none of these type is a time column (`HasCalendar`, UTC) when its
 * first non-null value is a JS `Date` (a column is a key of the first row):
 * inference is local, from the value alone, and a missing value says nothing
 * about the column. Strings and numbers are never inferred as time; they need
 * `Schema.time()`. Every time column's values become epoch milliseconds (see
 * {@link toEpochMs}); the rows are copied only when some value is not one
 * already. The copy leaves the caller's array untagged, so one array can
 * feed charts with different schemas.
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
  const own = getColumnTypes(rows);
  const records = rows as unknown as (Record<string, unknown> | null)[];
  const types: ColumnTypes = {};
  for (const [column, type] of Object.entries(inherited ?? {})) {
    const fits = fitsType(type);
    if (
      records.every(
        (r) => r == null || typeof r !== "object" || fits(r[column])
      )
    )
      types[column] = type;
  }
  Object.assign(types, own);
  for (const [column, entry] of Object.entries(schema)) {
    types[column] = columnTypeOf(column, entry);
  }
  // Date inference, in one pass over the rows: each untyped column of the
  // first row is resolved by its first non-null value.
  const unresolved = new Set(
    Object.keys(records.find((r) => r != null) ?? {}).filter(
      (column) => types[column] === undefined
    )
  );
  for (const r of records) {
    if (unresolved.size === 0) break;
    if (r == null) continue;
    for (const column of unresolved) {
      const v = r[column];
      if (v == null) continue;
      if (v instanceof Date) types[column] = { HasCalendar: { zone: "UTC" } };
      unresolved.delete(column);
    }
  }
  if (Object.keys(types).length === 0) return rows;
  const timeColumns = Object.entries(types).filter(
    ([, t]) => t.HasCalendar !== undefined
  );
  const isConverted = (row: T): boolean =>
    row == null ||
    typeof row !== "object" ||
    timeColumns.every(([column]) =>
      isEpochMs((row as Record<string, unknown>)[column])
    );
  let out: T[] = [...rows];
  if (timeColumns.length > 0) {
    await loadTemporal();
    for (const [column, t] of timeColumns)
      checkZone(column, t.HasCalendar!.zone);
  }
  if (!rows.every(isConverted)) {
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
  return setColumnTypes(out, types);
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
  if (isEpochMs(v)) return v;
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
