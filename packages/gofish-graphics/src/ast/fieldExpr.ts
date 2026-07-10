// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// Field-expression pipeline syntax (#700 Phase 1): `field("name")` returns a
// chainable expression — like a Polars column expression — where each method
// appends one op to an ordered pipeline. Order matters: `.bin().sort()` bins
// first, then sorts the resulting bins.
//
// Two disjoint slots consume the pipeline:
//   - DOMAIN ops (`sort`/`reverse`/`bin`) apply to a `by` grouping key — see
//     `splitEntries` in datumProjection.ts, the shared split+ops helper used
//     by spread/group/scatter.
//   - AGGREGATE ops (`sum`/`mean`/`count`/`distinct`) fold a value channel's
//     rows to a single value — see `evalFieldValues` below. Expression
//     evaluation is ORTHOGONAL to the channel's default aggregation (sum for
//     size, mean for pos): the channel applies its default exactly as it
//     always did, and over the singleton an aggregate op produces, sum and
//     mean are both the identity. Neither side knows about the other.
//   - `normalize` is a THIRD, disjoint slot: it is valid only on an
//     operator's (`spread`/`stack`) entry-flagged `size` channel, where it
//     replaces each split entry's size with its share of the window — see
//     `hasNormalizeOp`/`splitAtNormalize`/`applyEntryNormalize` below.
//     Everywhere else (a plain value slot, a `by` slot, or chained after
//     another op) it throws a clear "not yet supported"/"not valid here"
//     error at evaluation time.
//
// Only type-only imports from `data.ts` (no runtime import) so `data.ts` can
// import THIS module's class at runtime without a cycle.
import sumBy from "lodash/sumBy";
import meanBy from "lodash/meanBy";
import type { Measure, MaybeValue } from "./data";

export type FieldOp =
  | {
      op: "sort";
      by?: string;
      order?: "asc" | "desc";
      /** Explicit group order (#735), e.g. `.sort(["sun", "fog", ...])`.
       *  Mutually exclusive with `by`/`order`. Groups whose key isn't in
       *  this list are appended after, in natural sort order — see
       *  `sortEntries` in datumProjection.ts. */
      values?: (string | number)[];
    }
  | { op: "reverse" }
  | { op: "bin"; thresholds?: number | number[] }
  | { op: "normalize" }
  | { op: "sum" }
  | { op: "mean" }
  | { op: "count" }
  | { op: "distinct" };

/** The field-expression wire shape — what `FieldExpr#toJSON` emits and what
 *  the Python bridge/deserializer produces directly (no class involved). */
export type FieldExprWire = {
  type: "field";
  name: string;
  measure?: Measure;
  ops?: FieldOp[];
};

/**
 * `field(name)` returns an instance of this class. Immutable + chainable,
 * mirroring `DatumValueImpl` in data.ts: each method returns a NEW instance
 * with one more op appended (own fields, so they survive object spread), and
 * `toJSON` writes the canonical {@link FieldExprWire} shape. Evaluation sites
 * read ops off either form via {@link getFieldOps}.
 */
export class FieldExpr {
  public readonly type = "field" as const;
  constructor(
    public readonly name: string,
    public readonly measure?: Measure,
    /** @internal accumulated pipeline ops; read via {@link getFieldOps} */
    public readonly _ops: readonly FieldOp[] = []
  ) {}

  private _withOp(op: FieldOp): FieldExpr {
    return new FieldExpr(this.name, this.measure, [...this._ops, op]);
  }

  /** Order groups by an explicit list of group keys — e.g.
   *  `field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"])` for a
   *  domain-specific order that no aggregate expresses. Groups whose key
   *  isn't in the list are appended after, in natural sort order. Valid only
   *  in a `by` (domain) slot. */
  sort(values: (string | number)[]): FieldExpr;
  /** Order groups by the SUM of `by` over each group's rows (ascending unless
   *  `order: "desc"`), or by the group key itself when `by` is omitted. Valid
   *  only in a `by` (domain) slot. */
  sort(by?: string, order?: "asc" | "desc"): FieldExpr;
  sort(
    byOrValues?: string | (string | number)[],
    order?: "asc" | "desc"
  ): FieldExpr {
    if (Array.isArray(byOrValues)) {
      return this._withOp({ op: "sort", values: byOrValues });
    }
    return this._withOp({
      op: "sort",
      ...(byOrValues !== undefined ? { by: byOrValues } : {}),
      ...(order !== undefined ? { order } : {}),
    });
  }

  /** Reverse the group order. Valid only in a `by` (domain) slot. */
  reverse(): FieldExpr {
    return this._withOp({ op: "reverse" });
  }

  /** Bin this (numeric) field into groups, REPLACING the base grouping.
   *  Valid only in a `by` (domain) slot. */
  bin(options?: { thresholds?: number | number[] }): FieldExpr {
    return this._withOp({
      op: "bin",
      ...(options?.thresholds !== undefined
        ? { thresholds: options.thresholds }
        : {}),
    });
  }

  /** Space-filling normalization on an operator's (`spread`/`stack`) `size`
   *  channel: replaces each split entry's size with its SHARE of the window
   *  (`v_e / Σv_e` over the operator's own split entries), turning the stack
   *  axis into a space-filling spine — see `applyEntryNormalize` below. Valid
   *  only there; anywhere else (a plain value slot, or chained after another
   *  op) it throws a clear error. */
  normalize(): FieldExpr {
    return this._withOp({ op: "normalize" });
  }

  /** Fold the group's rows to the sum of this field. Valid only in a value
   *  (size/pos) slot. */
  sum(): FieldExpr {
    return this._withOp({ op: "sum" });
  }

  /** Fold the group's rows to the mean of this field. Valid only in a value
   *  (size/pos) slot. */
  mean(): FieldExpr {
    return this._withOp({ op: "mean" });
  }

  /** Fold the group's rows to the row count (ignores the field's own values).
   *  Valid only in a value (size/pos) slot. */
  count(): FieldExpr {
    return this._withOp({ op: "count" });
  }

  /** Fold the group's rows to the number of distinct values of this field.
   *  Valid only in a value (size/pos) slot. */
  distinct(): FieldExpr {
    return this._withOp({ op: "distinct" });
  }

  toJSON(): FieldExprWire {
    return {
      type: this.type,
      name: this.name,
      ...(this.measure !== undefined ? { measure: this.measure } : {}),
      ...(this._ops.length ? { ops: [...this._ops] } : {}),
    };
  }
}

/**
 * Read the pipeline ops off a field accessor, in either of its two forms: a
 * JS {@link FieldExpr} instance (ops in `_ops`; `.sort()`/`.bin()`/etc. are
 * the chaining methods) or the deserialized wire shape (a plain object with
 * an `ops` array, as the Python wrapper / IR emits). Mirrors
 * `getValueOffset`/`getValueColorOps` in data.ts. Non-field accessors (a bare
 * string, a function, a number, a literal) carry no ops.
 */
export function getFieldOps(accessor: unknown): FieldOp[] {
  if (accessor instanceof FieldExpr) return [...accessor._ops];
  if (
    accessor !== null &&
    typeof accessor === "object" &&
    (accessor as any).type === "field" &&
    Array.isArray((accessor as any).ops)
  ) {
    return (accessor as any).ops as FieldOp[];
  }
  return [];
}

/** Aggregate op names — valid only on a value (size/pos) channel slot. */
const AGGREGATE_OPS = new Set(["sum", "mean", "count", "distinct"]);
/** Domain op names — valid only on a `by` (grouping) slot. */
const DOMAIN_OPS = new Set(["sort", "reverse", "bin"]);

export const isAggregateOp = (op: FieldOp): boolean => AGGREGATE_OPS.has(op.op);
export const isDomainOp = (op: FieldOp): boolean => DOMAIN_OPS.has(op.op);

/**
 * Evaluate a field expression (or bare string/function accessor) against a
 * group's rows: the per-row values, folded to a SINGLETON when the pipeline
 * carries an aggregate op. This is self-contained expression evaluation — it
 * knows nothing about the consuming channel, and the channel needs no
 * knowledge of the pipeline: whatever default aggregation the channel applies
 * afterwards (sum for a size slot, mean for a pos slot) is the identity on a
 * singleton.
 *
 * Also reports the measure the pipeline itself determines, if any: `count` /
 * `distinct` yield counts — not the source field's units — so they report
 * measure "count" (an explicit `field(name, measure)` annotation still wins).
 * Every other pipeline reports none, leaving measure resolution to the caller
 * (`resolveMeasure`).
 *
 * Domain ops (`sort`/`reverse`/`bin`) don't belong in a value slot and throw;
 * so does a second aggregate (the fold happens once).
 */
export function evalFieldValues<T>(
  accessor: string | ((r: T) => unknown) | FieldExprWire | FieldExpr,
  rows: T[]
): { values: unknown[]; measure?: Measure } {
  const key: (r: T) => unknown =
    typeof accessor === "function"
      ? accessor
      : (r: any) =>
          r?.[typeof accessor === "string" ? accessor : accessor.name];
  let agg: FieldOp | undefined;
  for (const op of getFieldOps(accessor)) {
    if (isDomainOp(op)) {
      throw new Error(
        `field(...).${op.op}() is a domain (\`by\`) op — it isn't valid on ` +
          `a value channel (e.g. a size/pos channel like this one).`
      );
    }
    if (op.op === "normalize") throw normalizeNotSupportedError();
    if (agg !== undefined) {
      throw new Error(
        `field(...) can only carry one aggregate op; found ${agg.op}, ${op.op}.`
      );
    }
    agg = op;
  }
  if (agg === undefined) return { values: rows.map(key) };
  const annotation =
    typeof accessor === "object" && accessor !== null
      ? accessor.measure
      : undefined;
  switch (agg.op) {
    case "count":
      return { values: [rows.length], measure: annotation ?? "count" };
    case "distinct":
      return {
        values: [new Set(rows.map(key)).size],
        measure: annotation ?? "count",
      };
    case "mean":
      return { values: [meanBy(rows.map(key) as any[])] };
    default: // "sum"
      return { values: [sumBy(rows.map(key) as any[])] };
  }
}

/** The "not yet supported" error for `normalize()` outside its one valid
 *  slot (an operator's entry-flagged `size` channel), shared so every other
 *  evaluation site throws the identical message. */
export const normalizeNotSupportedError = (): Error =>
  new Error(
    "field(...).normalize() is only supported on an operator's size channel"
  );

/** Whether a field accessor's pipeline carries a `normalize` op anywhere. */
export function hasNormalizeOp(accessor: unknown): boolean {
  return getFieldOps(accessor).some((op) => op.op === "normalize");
}

/**
 * Split a field accessor's pipeline at its `normalize` op, for the entry-
 * flagged `size`-channel window in createOperator.ts's `applyChannels`: the
 * PRE expression (everything before `normalize`) evaluates once per split
 * entry exactly as any size accessor would — an aggregate op like `.count()`
 * if present, else the channel's own default sum (see `evalFieldValues` /
 * `inferSize` in channels.ts) — and the resulting per-entry values become the
 * window `applyEntryNormalize` shares. POST ops (anything chained after
 * `.normalize()`) have no defined meaning yet, so do a second `normalize()`;
 * both throw.
 */
export function splitAtNormalize(
  accessor: string | ((r: any) => unknown) | FieldExprWire | FieldExpr
): {
  pre: string | ((r: any) => unknown) | FieldExprWire | FieldExpr;
  post: FieldOp[];
} {
  const ops = getFieldOps(accessor);
  const idx = ops.findIndex((op) => op.op === "normalize");
  if (idx === -1) return { pre: accessor, post: [] };
  const rest = ops.slice(idx + 1);
  if (rest.some((op) => op.op === "normalize")) {
    throw new Error("field(...) can carry only one normalize() op.");
  }
  if (rest.length > 0) {
    throw new Error(
      `field(...).normalize().${rest[0].op}() is not yet supported — ops ` +
        `chained after normalize() have no defined meaning in a size ` +
        `channel's windowed share.`
    );
  }
  const preOps = ops.slice(0, idx);
  const name =
    accessor instanceof FieldExpr ? accessor.name : (accessor as any).name;
  const measure =
    accessor instanceof FieldExpr
      ? accessor.measure
      : (accessor as any).measure;
  const pre: FieldExprWire = {
    type: "field",
    name,
    ...(measure !== undefined ? { measure } : {}),
    ...(preOps.length ? { ops: preOps } : {}),
  };
  return { pre, post: rest };
}

/** Duck-typed read of a `Value<number>`'s `.datum`/`.measure`, without a
 *  runtime dependency on data.ts's `isValue`/`getValue`/`getMeasure` (this
 *  module must not import data.ts at runtime — see the file header). Mirrors
 *  their identical `.type === "datum"` check; a plain object literal with
 *  this shape IS the wire form those functions already accept. */
const isDatumValue = (
  v: unknown
): v is { type: "datum"; datum: unknown; measure?: Measure } =>
  typeof v === "object" && v !== null && (v as any).type === "datum";
const numericDatum = (v: MaybeValue<number>): number =>
  isDatumValue(v) ? Number(v.datum) : Number(v);
const datumMeasure = (v: MaybeValue<number>): Measure | undefined =>
  isDatumValue(v) ? v.measure : undefined;

/**
 * Share measure naming: a share is a NEW unit (0–1, not the base measure's
 * own units), so `"count"` and `"count share"` must never silently union on
 * the same axis — see `mergeMeasures`' throw in underlyingSpace.ts, which is
 * exactly the type guard this is meant to trigger. `byName`, when present,
 * further qualifies by the grouping field the shares were computed over, so
 * a per-`origin` share and a per-`cylinders` share (two nesting levels of the
 * same mosaic) stay distinct measures even though both are "count share".
 */
export const shareMeasure = (
  base: Measure | undefined,
  byName?: string
): Measure => `${base ?? "value"} share${byName ? ` by ${byName}` : ""}`;

/**
 * The windowed normalize stage: given the collected per-entry Values already
 * evaluated with the PRE-normalize expression (see `splitAtNormalize`), compute
 * each entry's share `v_e / Σv_e` across the window — the operator's own split
 * entries. A non-positive total has no meaningful share, so every entry gets 0
 * and a console warning rather than a divide-by-zero/negative-share NaN. Shares
 * are tagged with `shareMeasure` — see its doc for why that's load-bearing.
 */
export function applyEntryNormalize(
  entryValues: MaybeValue<number>[],
  byName?: string
): MaybeValue<number>[] {
  const nums = entryValues.map(numericDatum);
  const total = sumBy(nums);
  const baseMeasure = entryValues
    .map(datumMeasure)
    .find((m) => m !== undefined);
  const measure = shareMeasure(baseMeasure, byName);
  if (!(total > 0)) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(
        `field(...).normalize(): the entry total is ${total} (≤ 0), so ` +
          `every share is 0. Check that the size field/aggregate produces ` +
          `positive values.`
      );
    }
    return nums.map(() => ({ type: "datum", datum: 0, measure }) as const);
  }
  return nums.map(
    (n) => ({ type: "datum", datum: n / total, measure }) as const
  );
}
