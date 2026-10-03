// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { StackOrigin } from "./constraints/distribute";

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
 *  - {@link HasCenter}: the order has a center, the fixed point of reversing
 *    it. Declared with `.diverging()`, which exists only after `.ordered(...)`
 *    because a center needs an order. A stack over the column puts its origin
 *    (its 0) at the center.
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

/** The class of an ordered column whose order has a center: the fixed point of
 *  reversing the order. With an odd number of levels it is the middle level
 *  (half of it lies on each side); with an even number it is the boundary
 *  between the two middle levels. It carries no data of its own: the center
 *  follows from {@link HasOrder}, which it requires. */
export type HasCenter = true;

/** A column's type: the classes it has, keyed by class name. */
export type ColumnType = {
  HasOrder?: HasOrder;
  HasCenter?: HasCenter;
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

  /** Give the column a center (`HasCenter`): the middle of its order. */
  diverging(
    this: ColumnSchema<C & { HasOrder: HasOrder }>
  ): ColumnSchema<C & { HasOrder: HasOrder; HasCenter: HasCenter }> {
    return new ColumnSchema({ ...this.type, HasCenter: true as const });
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
 *  builder enforces in its types (a record from the wire has no types). */
export function columnTypeOf(column: string, entry: SchemaEntry): ColumnType {
  const type = entry instanceof ColumnSchema ? entry.type : entry;
  if (type.HasCenter && !type.HasOrder) {
    throw new Error(
      `schema: column "${column}" has HasCenter but no HasOrder. A center ` +
        `is the middle of an order; declare the order with ` +
        `\`Schema.ordered(levels)\` before \`.diverging()\`.`
    );
  }
  return type;
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
 * (merged over any the array already carries), after checking that every
 * value of an ordered column is one of its levels.
 */
export function applySchema<T>(
  rows: T[],
  schema: Record<string, SchemaEntry>,
  checkRow: (row: T) => boolean = () => true
): T[] {
  const types: ColumnTypes = { ...getColumnTypes(rows) };
  for (const [column, entry] of Object.entries(schema)) {
    types[column] = columnTypeOf(column, entry);
  }
  for (const [column, type] of Object.entries(types)) {
    if (!type.HasOrder) continue;
    const levels = new Set<unknown>(type.HasOrder.levels);
    const strays = new Set<unknown>();
    for (const row of rows) {
      if (!checkRow(row)) continue;
      const v = (row as Record<string, unknown>)?.[column];
      if (!levels.has(v)) strays.add(v);
    }
    if (strays.size > 0) throw strayLevelsError(column, [...strays]);
  }
  return setColumnTypes([...rows], types);
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
 * when `reverse`): the center of the column's order, when the column has
 * {@link HasCenter}; else undefined (the default origin). Every key is a
 * level of the order: `splitEntries` has already checked.
 *
 * The center is defined by the ORDER, not by the parts present: a group the
 * data lacks moves nothing. With an odd number of levels it is the middle of
 * the middle level when that group is present, and otherwise the boundary
 * where it would be; with an even number it is the boundary between the two
 * middle levels. A boundary is the tail of the first part laid out past it,
 * or the head of the last part when every part lies before it.
 */
export function stackOrigin(
  column: string | undefined,
  type: ColumnType | undefined,
  keys: unknown[],
  reverse = false
): StackOrigin<number> | undefined {
  if (column === undefined || !type?.HasCenter || keys.length === 0)
    return undefined;
  const { levels } = type.HasOrder!;
  const rank = levelRanks(type.HasOrder!);
  const center = (levels.length - 1) / 2;
  // Ranks in layout order.
  const order = keys.map((_, i) => (reverse ? keys.length - 1 - i : i));
  const ranks = order.map((i) => rank.get(keys[i])!);
  // Laid out along the order (+1) or against it (−1). The parts must follow
  // the order one way or the other, or "before the center" is not a prefix.
  const dir =
    ranks.length > 1 ? Math.sign(ranks[1] - ranks[0]) : reverse ? -1 : 1;
  for (let p = 1; p < ranks.length; p++) {
    if (Math.sign(ranks[p] - ranks[p - 1]) !== dir) {
      throw new Error(
        `stack({ by: "${column}" }): a centered stack lays its parts out in ` +
          `the order of "${column}" (or its reverse), but they are in the ` +
          `order ${order.map((i) => showLevel(keys[i])).join(", ")}. ` +
          `HasCenter (declared with \`.diverging()\`) puts the stack's 0 at ` +
          `the center of that order, which needs the parts on each side of it ` +
          `together. Drop the reordering of "${column}".`
      );
    }
  }
  const at = (p: number, fraction: number): StackOrigin<number> => ({
    part: order[p],
    fraction,
    mirrored: true,
  });
  for (let p = 0; p < ranks.length; p++) {
    if (ranks[p] === center) return at(p, 0.5);
    // The first part laid out past the center: the center is its tail.
    if (dir * (ranks[p] - center) > 0) return at(p, 0);
  }
  // Every part lies before the center: it is the last part's head.
  return at(ranks.length - 1, 1);
}
