// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { Interval } from "./dims";
import { FieldExpr, type FieldOp } from "./fieldExpr";
import type { ColumnType } from "./schema";
import { resolveUnit, sameUnit, Units, type Quantity } from "./measure";

export type { FieldOp } from "./fieldExpr";
export { FieldExpr } from "./fieldExpr";

export type Value<T> = T | DatumValue | DatumValueImpl;
export type MaybeValue<T> = T | Value<T>;

/**
 * Placement-only coordinate used for categorical scatter. It is not a datum:
 * it does not contribute a data domain or pass through a scale. The placement
 * lowerer resolves it from the containing axis size as `index / count * size`.
 */
export type DiscretePosition = {
  type: "discrete-position";
  index: number;
  count: number;
};

export const discretePosition = (
  index: number,
  count: number
): DiscretePosition => ({
  type: "discrete-position",
  index,
  count,
});

export const isDiscretePosition = (value: unknown): value is DiscretePosition =>
  typeof value === "object" &&
  value !== null &&
  (value as any).type === "discrete-position" &&
  typeof (value as any).index === "number" &&
  typeof (value as any).count === "number";

export type PositionValue = MaybeValue<number> | DiscretePosition;

/**
 * A post-scale color transform carried by a datum value, applied AFTER the
 * datum maps through its color scale ("this category's color, lightened"). The
 * color analog of {@link DatumValue.offset}; set via `datum(v).lighten(t)` /
 * `.darken(t)` in JS (`datum(v).lighten(t)` in Python). Read with
 * {@link getValueColorOps}, applied with `applyColorOps` (color.ts).
 */
export type ColorOp = { op: "lighten" | "darken"; amount: number };

/** The datum wrapper's WIRE shape — what the Python bridge emits and what the
 *  {@link getValue} / {@link getQuantity} casts read. `offset` is a pixel
 *  offset added AFTER the datum maps through its scale ("a fixed standoff
 *  from a data position"); set via `datum(v).offset(px)` in JS or
 *  `datum(v) + px` in Python, read with {@link getValueOffset}. */
type DatumValue = {
  type: "datum";
  datum: any;
  /** What the value is an amount of, when a channel read it from a column
   *  (set by channel inference, never by the user; see `measure.ts`). */
  quantity?: Quantity;
  offset?: number;
  colorOps?: ColorOp[];
  field?: string;
};

/**
 * Datum wrapper instance, as built by `datum(...)` / `value(...)` in JS. A
 * class (not a plain object) so `.offset(px)` can CHAIN while the serialized
 * field is still named `offset`: instances keep the pixels in `_offset` (an
 * own field, so it survives object spread) and `toJSON` writes the canonical
 * {@link DatumValue} wire shape. Resolution sites read either form via
 * {@link getValueOffset}.
 */
export class DatumValueImpl {
  public readonly type = "datum" as const;
  constructor(
    public readonly datum: any,
    /** What the value is an amount of, when a channel read it from a column
     *  (see `measure.ts`). Read via {@link getQuantity}. */
    public readonly quantity?: Quantity,
    /** @internal accumulated pixel offset; read via {@link getValueOffset} */
    public readonly _offset?: number,
    /** @internal accumulated color transforms; read via {@link getValueColorOps} */
    public readonly _colorOps?: ColorOp[],
    /** The data field this datum was read from, when a channel named one
     *  (`fill: "product"` reads `row.product`). Provenance only: it plays no
     *  part in unit checking ({@link quantity} does). Read via
     *  {@link getValueField}. */
    public readonly field?: string,
    /** The type the chart's `schema` declares for {@link field}, when it
     *  declares one (schema.ts). A color scale over an ordered column lists
     *  its domain in the column's order. Read via {@link getValueFieldType}. */
    public readonly fieldType?: ColumnType
  ) {}

  /** A new value at the same datum, shifted `px` pixels post-scale —
   *  "this data position, plus pixels". */
  offset(px: number): DatumValueImpl {
    return new DatumValueImpl(
      this.datum,
      this.quantity,
      (this._offset ?? 0) + px,
      this._colorOps,
      this.field,
      this.fieldType
    );
  }

  /** A new value whose resolved color is lightened by `amount` (0–1) toward
   *  white, applied AFTER the color scale maps the datum — "this category's
   *  color, lightened". Chains with `.darken`. */
  lighten(amount: number): DatumValueImpl {
    return this._withColorOp({ op: "lighten", amount });
  }

  /** A new value whose resolved color is darkened by `amount` (0–1) toward
   *  black, applied AFTER the color scale maps the datum. Chains with
   *  `.lighten`. */
  darken(amount: number): DatumValueImpl {
    return this._withColorOp({ op: "darken", amount });
  }

  private _withColorOp(op: ColorOp): DatumValueImpl {
    return new DatumValueImpl(
      this.datum,
      this.quantity,
      this._offset,
      [...(this._colorOps ?? []), op],
      this.field,
      this.fieldType
    );
  }

  toJSON(): DatumValue {
    return {
      type: this.type,
      datum: this.datum,
      ...(this.quantity !== undefined ? { quantity: this.quantity } : {}),
      ...(this._offset ? { offset: this._offset } : {}),
      ...(this._colorOps?.length ? { colorOps: this._colorOps } : {}),
      ...(this.field !== undefined ? { field: this.field } : {}),
    };
  }
}

export const value = <T>(datum: T): DatumValueImpl => new DatumValueImpl(datum);

/**
 * `datum(x)` is the recommended name for the data-driven value wrapper
 * (matches the `field` / `datum` / `literal` trichotomy from Vega-Lite's
 * encoding model). Identical to `value(x)` / `v(x)`; chosen as the
 * canonical name going forward.
 */
export const datum = value;

/**
 * The field-accessor WIRE shape (what `field(...)` serializes to and what a
 * deserialized IR/Python-bridge accessor looks like as a plain object). `ops`
 * is the field-expression pipeline — see {@link FieldOp} and
 * `fieldExpr.ts`'s `FieldExpr` class, which `field(...)` actually returns so
 * `.sort()`/`.bin()`/`.mean()`/etc. can chain while still serializing to this
 * shape via `toJSON`.
 */
export type FieldAccessor = {
  type: "field";
  name: string;
  ops?: FieldOp[];
};

/**
 * `field(name)` is an explicit field-accessor wrapper. The channel
 * inference functions (`inferSize` / `inferPos` / `inferColor` / `inferRaw`)
 * recognize the tag and resolve it to a per-row value, identical to passing a
 * bare string. Use this when the field name could be confused with a literal
 * (e.g. `field("0.5")`), or to chain a pipeline (`field("v").mean()`). A
 * column's unit is declared in the chart's schema (`Schema.unit`), not here.
 */
export const field = (name: string): FieldExpr => new FieldExpr(name);
export const isField = (v: unknown): v is FieldAccessor =>
  typeof v === "object" &&
  v !== null &&
  (v as any).type === "field" &&
  typeof (v as any).name === "string";

/**
 * The `chunk(size)` grouping key's wire shape: a bin over row position.
 * Serializes as-is (it is plain data, not a function).
 */
export type ChunkKey = { type: "chunk"; size: number };

/**
 * `chunk(size)` is a `by` key that groups consecutive rows: row `i` goes to
 * group `Math.floor(i / size)`. It is a bin of width `size` over row
 * position, so `spread({ by: chunk(5), dir: "y" })` lays the rows out five to
 * a group (the rows of a waffle chart). If a row-position field ever exists,
 * this is that field binned by `size`. Like lodash `_.chunk`, Rust
 * `chunks(n)` and Python `itertools.batched`. The key names no field, so the
 * groups draw no axis or labels. `chunk(1)` is row identity: one group per
 * row, which is the split an operator does when it has no `by`.
 */
export const chunk = (size: number): ChunkKey => {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(
      `chunk(size): size must be a positive integer, got ${size}`
    );
  }
  return { type: "chunk", size };
};
export const isChunk = (v: unknown): v is ChunkKey =>
  typeof v === "object" &&
  v !== null &&
  (v as any).type === "chunk" &&
  typeof (v as any).size === "number";

/** The field name a `by`-style selector names, or `undefined` when it names
 *  none (a key function or `chunk`).The one reading of "which field did this group by",
 *  shared by every site that needs it. */
export function fieldNameOf(by: unknown): string | undefined {
  if (typeof by === "string") return by;
  return isField(by) ? by.name : undefined;
}

/**
 * `literal(x)` is an explicit constant wrapper. Channel inference passes
 * it through as-is — the value is not scaled, not data-derived. Use this
 * when a string constant could be confused with a field name (e.g.
 * `literal("count")` when "count" is also a column).
 */
export type LiteralValue = { type: "literal"; value: any };
export const literal = (value: any): LiteralValue => ({
  type: "literal",
  value,
});
export const isLiteral = (v: unknown): v is LiteralValue =>
  typeof v === "object" &&
  v !== null &&
  (v as any).type === "literal" &&
  "value" in (v as any);

export const isValue = <T>(
  value: MaybeValue<T>
): value is Exclude<Value<T>, undefined> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "datum"
  );
};

export const isAesthetic = <T>(
  value: MaybeValue<T>
): value is Exclude<T, undefined> => {
  return !isValue(value) && value !== undefined;
};

export const getValue = <T>(value: MaybeValue<T>): T => {
  if (isValue(value)) {
    return (value as DatumValue).datum;
  }
  return value as T;
};

/**
 * The {@link Quantity} a datum value is an amount of, or `undefined` when it
 * was not read from a column (a literal datum) or is a raw aesthetic (not a
 * datum at all). A value with no quantity makes no claim: its space's
 * units are undefined, which join with anything (`joinUnits`).
 */
export const getQuantity = <T>(value: MaybeValue<T>): Quantity | undefined =>
  isValue(value) ? (value as DatumValue).quantity : undefined;

/** Whether two values are in the same unit, read through the render's
 *  union-find `units` (the representative `spaceUnit` reads): one declared
 *  unit, or one class of unknowns. Two values with no quantity (literals)
 *  are; a literal and a column's value are not. */
export const sameValueUnit = <T>(
  a: MaybeValue<T>,
  b: MaybeValue<T>,
  units: Units
): boolean => {
  const qa = getQuantity(a);
  const qb = getQuantity(b);
  if (qa === undefined || qb === undefined) return qa === qb;
  return sameUnit(resolveUnit(units.of(qa)), resolveUnit(units.of(qb)));
};

/**
 * The post-scale pixel offset carried by a datum value, in either of its two
 * forms: a JS {@link DatumValueImpl} instance (pixels in `_offset`; `offset`
 * is the chaining method) or the deserialized wire shape (a plain object with
 * a numeric `offset`, as the Python wrapper emits for `datum(v) + px`).
 */
export const getValueOffset = <T>(value: MaybeValue<T>): number => {
  if (!isValue(value)) return 0;
  const v = value as any;
  if (typeof v.offset === "number") return v.offset;
  return typeof v._offset === "number" ? v._offset : 0;
};

/**
 * The post-scale color transforms carried by a datum value, in either of its
 * two forms: a JS {@link DatumValueImpl} instance (ops in `_colorOps`;
 * `lighten`/`darken` are the chaining methods) or the deserialized wire shape
 * (a plain object with a `colorOps` array, as the Python wrapper emits for
 * `datum(v).lighten(t)`). Empty when the value carries no color transform.
 */
/** The data field a value was read from (see {@link DatumValueImpl.field}),
 *  in either the class or the wire form; `undefined` for a literal, a
 *  hand-made value, or one read by a function accessor. */
export const getValueField = <T>(value: MaybeValue<T>): string | undefined =>
  isValue(value) ? (value as DatumValue).field : undefined;

/** The schema type of the field a value was read from, if any (only a live
 *  {@link DatumValueImpl} carries one; the wire shape does not). */
export const getValueFieldType = <T>(
  value: MaybeValue<T>
): ColumnType | undefined =>
  value instanceof DatumValueImpl ? value.fieldType : undefined;

export const getValueColorOps = <T>(value: MaybeValue<T>): ColorOp[] => {
  if (!isValue(value)) return [];
  const v = value as any;
  if (Array.isArray(v.colorOps)) return v.colorOps;
  return Array.isArray(v._colorOps) ? v._colorOps : [];
};

/**
 * The intrinsic-embedding predicate: a dim's *own* extent is a coordinate-space
 * extent (so a coord warps it) iff its size is a data {@link Value} (or unsized —
 * the nest-growth case) AND its `min` is in the same unit as its size
 * ({@link sameValueUnit}, read through the render's union-find `units`; a
 * fresh one when there is no render). This is the coord-free half; the
 * {@link GoFishNode.resolveEmbedding} pass layers the Route-B unit gate on
 * top (a size in a unit *foreign* to the axis stays ink, not a coord extent).
 * Extracted so the pass is the sole author of `embedded` and the rule lives
 * in one place. See #534.
 */
export const baseEmbedded = <T>(
  interval: Interval<T>,
  units: Units = new Units()
): boolean =>
  (isValue(interval.size) || interval.size === undefined) &&
  (interval.min === undefined ||
    !isValue(interval.min) ||
    sameValueUnit(interval.min, interval.size, units));
