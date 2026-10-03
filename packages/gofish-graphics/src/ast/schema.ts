// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { StackOrigin } from "./constraints/distribute";
import { copyMeasureProvenance } from "./data";

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

/** A column's type: the classes it has, keyed by class name. */
export type ColumnType = {
  HasOrder?: HasOrder;
  HasMidpoint?: HasMidpoint;
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
   *  `n / 2` for `n` levels. */
  diverging(
    this: ColumnSchema<C & { HasOrder: HasOrder }>,
    { midpoint }: { midpoint?: number } = {}
  ): ColumnSchema<C & { HasOrder: HasOrder; HasMidpoint: HasMidpoint }> {
    const at = midpoint ?? this.type.HasOrder.levels.length / 2;
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
};

/** What `chart`'s `schema` option takes per column: a builder, or the record
 *  it writes (the wire form). */
export type SchemaEntry = ColumnSchema<ColumnType> | ColumnType;

/** The record a schema entry stands for, checked for the prerequisites the
 *  builder enforces in its types (a record from the wire has no types) and
 *  for a midpoint on its order. */
export function columnTypeOf(column: string, entry: SchemaEntry): ColumnType {
  const type = entry instanceof ColumnSchema ? entry.type : entry;
  checkMidpoint(column, type);
  return type;
}

/** The loud errors for a {@link HasMidpoint} without {@link HasOrder} (only a
 *  wire record can have one) or off its order (`chart` checks the midpoint
 *  here, where the column has a name, not in `.diverging()`). */
function checkMidpoint(column: string, type: ColumnType): void {
  if (type.HasMidpoint === undefined) return;
  const name = `column "${column}"`;
  if (!type.HasOrder) {
    throw new Error(
      `schema: ${name} has HasMidpoint but no HasOrder. A midpoint is a ` +
        `point along an order; declare the order with ` +
        `\`Schema.ordered(levels)\` before \`.diverging()\`.`
    );
  }
  const n = type.HasOrder.levels.length;
  const at = type.HasMidpoint.at;
  if (typeof at !== "number" || !Number.isFinite(at) || at < 0 || at > n) {
    throw new Error(
      `schema: ${name} has midpoint ${String(at)}, but its order has ${n} ` +
        `level${n === 1 ? "" : "s"}, so \`.diverging({ midpoint })\` takes ` +
        `a number from 0 (before the first level) to ${n} (after the last).`
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

/** Copy `source`'s column types onto `target` (both arrays), if it has any. A
 *  split leaf or a derive's result is a fresh array, so it has to be told. */
export const copyColumnTypes = <T>(target: T, source: unknown): T => {
  const types = getColumnTypes(source);
  if (types !== undefined && getColumnTypes(target) === undefined)
    setColumnTypes(target, types);
  return target;
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
 * (merged over any the array already carries) and the measure provenance it
 * carries. The copy leaves the caller's array untagged, so one array can feed
 * charts with different schemas.
 *
 * It does not check the values: a value outside an order is an error where the
 * order is used (`orderByLevels`), so a `filter` in the flow can drop it first.
 */
export function applySchema<T>(
  rows: T[],
  schema: Record<string, SchemaEntry>
): T[] {
  const types: ColumnTypes = { ...getColumnTypes(rows) };
  for (const [column, entry] of Object.entries(schema)) {
    types[column] = columnTypeOf(column, entry);
  }
  return setColumnTypes(copyMeasureProvenance([...rows], rows), types);
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
