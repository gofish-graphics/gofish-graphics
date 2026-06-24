// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { Interval } from "./dims";

export type Measure = string;

export const measure = (unit: string): Measure => unit;

/**
 * Well-known symbol used to tag a data ARRAY with the *measure provenance* of
 * its columns — a map from field name to the {@link Measure} that produced it.
 * This is how a data-transform like `bin()` declares that its output `start`/
 * `end`/`size` columns are still expressed in the *source* field's units (e.g.
 * "Beak Length (mm)") rather than the literal field-name "start". The symbol
 * rides the array (not each row) so it survives `derive(...)`, which passes the
 * transformed array straight through to the next operator.
 *
 * Channel inference (`resolveMeasure` in channels.ts) reads this as one of the
 * three measure sources; see issue #266 for the field/datum/literal trichotomy.
 */
export const MEASURE_PROVENANCE: unique symbol = Symbol.for(
  "gofish.measureProvenance"
);
export type MeasureProvenance = Record<string, Measure>;

/** Read the measure-provenance map a data array carries, if any. */
export const getMeasureProvenance = (
  data: unknown
): MeasureProvenance | undefined =>
  data != null
    ? ((data as any)[MEASURE_PROVENANCE] as MeasureProvenance | undefined)
    : undefined;

/**
 * Tag a data array with a measure-provenance map under {@link MEASURE_PROVENANCE}.
 * Owns the non-enumerable encoding so the symbol rides the array (not each row,
 * not an enumerable own-key that would leak into `{...d}` spreads) and survives
 * `derive(...)`. Used by transforms like `bin()`.
 */
export const setMeasureProvenance = <T>(
  data: T,
  provenance: MeasureProvenance
): T => {
  Object.defineProperty(data, MEASURE_PROVENANCE, {
    value: provenance,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return data;
};

/**
 * Copy the measure-provenance map from `source` onto `target` (both arrays), if
 * `source` carries one. A split leaf is a FRESH sub-array (groupBy/filter/slice)
 * that doesn't inherit the operator input's symbol, so without this a MARK
 * channel bound to a transform-output field (e.g. `bin()`'s `start`/`end`/`size`)
 * sees no provenance and falls back to the literal field name — making a
 * legitimate overlay against the source-field axis a false measure conflict.
 * Re-tagging each leaf with its parent's provenance lets `inferSize`/`inferPos`
 * read the source measure off their own `data` argument, so marks and operators
 * share one mechanism. See {@link resolveMeasure} and #534.
 */
export const copyMeasureProvenance = <T>(target: T, source: unknown): T => {
  const provenance = getMeasureProvenance(source);
  if (provenance !== undefined) setMeasureProvenance(target, provenance);
  return target;
};

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

/** The datum wrapper's WIRE shape — what the Python bridge emits and what the
 *  {@link getValue} / {@link getMeasure} casts read. `offset` is a pixel
 *  offset added AFTER the datum maps through its scale ("a fixed standoff
 *  from a data position"); set via `datum(v).offset(px)` in JS or
 *  `datum(v) + px` in Python, read with {@link getValueOffset}. */
/**
 * A post-scale color transform carried by a datum value, applied AFTER the
 * datum maps through its color scale ("this category's color, lightened"). The
 * color analog of {@link DatumValue.offset}; set via `datum(v).lighten(t)` /
 * `.darken(t)` in JS (`datum(v).lighten(t)` in Python). Read with
 * {@link getValueColorOps}, applied with `applyColorOps` (color.ts).
 */
export type ColorOp = { op: "lighten" | "darken"; amount: number };

type DatumValue = {
  type: "datum";
  datum: any;
  measure?: Measure;
  offset?: number;
  colorOps?: ColorOp[];
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
    public readonly _offset?: number,
    /** @internal accumulated color transforms; read via {@link getValueColorOps} */
    public readonly _colorOps?: ColorOp[]
  ) {}

  /** A new value at the same datum, shifted `px` pixels post-scale —
   *  "this data position, plus pixels". */
  offset(px: number): DatumValueImpl {
    return new DatumValueImpl(
      this.datum,
      this.measure,
      (this._offset ?? 0) + px,
      this._colorOps
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
    return new DatumValueImpl(this.datum, this.measure, this._offset, [
      ...(this._colorOps ?? []),
      op,
    ]);
  }

  toJSON(): DatumValue {
    return {
      type: this.type,
      datum: this.datum,
      ...(this.measure !== undefined ? { measure: this.measure } : {}),
      ...(this._offset ? { offset: this._offset } : {}),
      ...(this._colorOps?.length ? { colorOps: this._colorOps } : {}),
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
 * `field(name, measure?)` is an explicit field-accessor wrapper. The channel
 * inference functions (`inferSize` / `inferPos` / `inferColor` / `inferRaw`)
 * recognize the tag and resolve it to a per-row value, identical to passing a
 * bare string. Use this when the field name could be confused with a literal
 * (e.g. `field("0.5")`).
 *
 * The optional `measure` is an *explicit unit annotation* — a real type claim
 * about the channel's underlying space (see {@link Measure}). It is one of the
 * three measure sources `resolveMeasure` (channels.ts) checks: a bare string
 * accessor's field-name is only a *weak default*, whereas this annotation (and
 * `bin()`'s {@link MEASURE_PROVENANCE}) is a hard claim that triggers a type
 * error if it contradicts inferred provenance. Issue #266 is the field/datum/
 * literal trichotomy this completes.
 */
export type FieldAccessor = { type: "field"; name: string; measure?: Measure };
export const field = (name: string, measure?: Measure): FieldAccessor => ({
  type: "field",
  name,
  ...(measure !== undefined ? { measure } : {}),
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

/**
 * The {@link Measure} carried by a datum value, or `undefined` when it carries
 * none (a measureless datum) or is a raw aesthetic (not a datum at all).
 *
 * Returns `undefined` rather than a sentinel string ("unit"/"unknown") so that
 * a measureless value unifies *permissively* with a tagged one — see
 * `mergeMeasures` in underlyingSpace.ts, whose undefined-permissive rule is the
 * whole point of distinguishing "no claim" from "a specific unit".
 */
export const getMeasure = <T>(value: MaybeValue<T>): Measure | undefined => {
  if (isValue(value)) {
    return (value as DatumValue).measure;
  }
  return undefined;
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
export const getValueColorOps = <T>(value: MaybeValue<T>): ColorOp[] => {
  if (!isValue(value)) return [];
  const v = value as any;
  if (Array.isArray(v.colorOps)) return v.colorOps;
  return Array.isArray(v._colorOps) ? v._colorOps : [];
};

/**
 * The intrinsic-embedding predicate: a dim's *own* extent is a coordinate-space
 * extent (so a coord warps it) iff its size is a data {@link Value} (or unsized —
 * the nest-growth case) AND its `min` doesn't contradict the size's measure. This
 * is the measure-free half; the {@link GoFishNode.resolveEmbedding} pass layers
 * the Route-B measure gate on top (a size denominated in a *foreign* measure to
 * the axis stays ink, not a coord extent). Extracted so the pass is the sole
 * author of `embedded` and the rule lives in one place. See #534.
 */
export const baseEmbedded = <T>(interval: Interval<T>): boolean =>
  (isValue(interval.size) || interval.size === undefined) &&
  (interval.min === undefined ||
    !isValue(interval.min) ||
    getMeasure(interval.min) === getMeasure(interval.size));
