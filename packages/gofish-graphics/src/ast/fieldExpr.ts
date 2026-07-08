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
// `normalize` is reserved for Phase 2 (operator size-channel space-filling);
// it type-checks here but throws a clear "not yet supported" error wherever
// it would be evaluated.
//
// Only type-only imports from `data.ts` (no runtime import) so `data.ts` can
// import THIS module's class at runtime without a cycle.
import sumBy from "lodash/sumBy";
import meanBy from "lodash/meanBy";
import type { Measure } from "./data";

export type FieldOp =
  | { op: "sort"; by?: string; order?: "asc" | "desc" }
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

  /** Order groups by the SUM of `by` over each group's rows (ascending unless
   *  `order: "desc"`), or by the group key itself when `by` is omitted. Valid
   *  only in a `by` (domain) slot. */
  sort(by?: string, order?: "asc" | "desc"): FieldExpr {
    return this._withOp({
      op: "sort",
      ...(by !== undefined ? { by } : {}),
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

  /** Reserved for Phase 2 — space-filling normalization on an operator's size
   *  channel. Evaluating it today throws a clear "not yet supported" error. */
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

/** The Phase-2 "not yet supported" error, shared so both slots throw the
 *  identical message. */
export const normalizeNotSupportedError = (): Error =>
  new Error(
    "field(...).normalize() is only supported on an operator's size channel"
  );
