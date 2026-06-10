import { Interval } from "./dims";

export type Measure = string;

export const measure = (unit: string): Measure => unit;

export type Value<T> = T | DatumValue | DatumValueImpl;
export type MaybeValue<T> = T | Value<T>;

/** The datum wrapper's WIRE shape — what the Python bridge emits and what the
 *  {@link getValue} / {@link getMeasure} casts read. `offset` is a pixel
 *  offset added AFTER the datum maps through its scale ("a fixed standoff
 *  from a data position"); set via `datum(v).offset(px)` in JS or
 *  `datum(v) + px` in Python, read with {@link getValueOffset}. */
type DatumValue = {
  type: "datum";
  datum: any;
  measure?: Measure;
  offset?: number;
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
    public readonly measure?: Measure,
    /** @internal accumulated pixel offset; read via {@link getValueOffset} */
    public readonly _offset?: number
  ) {}

  /** A new value at the same datum, shifted `px` pixels post-scale —
   *  "this data position, plus pixels". */
  offset(px: number): DatumValueImpl {
    return new DatumValueImpl(
      this.datum,
      this.measure,
      (this._offset ?? 0) + px
    );
  }

  toJSON(): DatumValue {
    return {
      type: this.type,
      datum: this.datum,
      ...(this.measure !== undefined ? { measure: this.measure } : {}),
      ...(this._offset ? { offset: this._offset } : {}),
    };
  }
}

export const value = <T>(datum: T, measure?: Measure): DatumValueImpl =>
  new DatumValueImpl(datum, measure);

/**
 * `datum(x)` is the recommended name for the data-driven value wrapper
 * (matches the `field` / `datum` / `literal` trichotomy from Vega-Lite's
 * encoding model). Identical to `value(x)` / `v(x)`; chosen as the
 * canonical name going forward.
 */
export const datum = value;

/**
 * `field(name)` is an explicit field-accessor wrapper. The channel inference
 * functions (`inferSize` / `inferPos` / `inferColor` / `inferRaw`) recognize
 * the tag and resolve it to a per-row value, identical to passing a bare
 * string. Use this when the field name could be confused with a literal
 * (e.g. `field("0.5")`).
 */
export type FieldAccessor = { type: "field"; name: string };
export const field = (name: string): FieldAccessor => ({
  type: "field",
  name,
});
export const isField = (v: unknown): v is FieldAccessor =>
  typeof v === "object" &&
  v !== null &&
  (v as any).type === "field" &&
  typeof (v as any).name === "string";

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

export const getMeasure = <T>(value: MaybeValue<T>): Measure => {
  if (isValue(value)) {
    return (value as DatumValue).measure ?? "unit";
  }
  return "unknown";
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

export const inferEmbedded = <T>(interval: Interval<T>): Interval<T> => {
  // size must be a value && min must be undefined, aesthetic, or a value of the same type as size
  if (
    (isValue(interval.size) || interval.size === undefined) &&
    (interval.min === undefined ||
      !isValue(interval.min) ||
      getMeasure(interval.min) === getMeasure(interval.size))
  ) {
    return { ...interval, embedded: true };
  }
  return interval;
};
