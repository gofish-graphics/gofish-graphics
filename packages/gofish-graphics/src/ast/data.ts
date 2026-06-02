import { Interval } from "./dims";

export type Measure = string;

export const measure = (unit: string): Measure => unit;

export type Value<T> = T | { type: "datum"; datum: any; measure?: Measure };
export type MaybeValue<T> = T | Value<T>;

export const value = <T>(datum: T, measure?: Measure): Value<any> => ({
  type: "datum",
  datum,
  measure,
});

/** Object branch of {@link Value}; named here so the {@link getValue} /
 *  {@link getMeasure} casts don't read as opaque. Keep in sync with the
 *  inline shape in {@link Value} above. */
type DatumValue = { type: "datum"; datum: any; measure?: Measure };

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
