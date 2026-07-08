// Field-expression pipeline syntax (#700 Phase 1): `field("name")` returns a
// chainable expression — like a Polars column expression — where each method
// appends one op to an ordered pipeline. Order matters: `.bin().sort()` bins
// first, then sorts the resulting bins.
//
// Two disjoint slots consume the pipeline:
//   - DOMAIN ops (`sort`/`reverse`/`bin`) apply to a `by` grouping key — see
//     `splitEntries` in datumProjection.ts, the shared split+ops helper used
//     by spread/group/scatter.
//   - AGGREGATE ops (`sum`/`mean`/`count`/`distinct`) apply to a value channel
//     (size/pos) — see `inferNumeric` in channels.ts, which overrides the
//     channel's default aggregation (sum for size, mean for pos) when exactly
//     one aggregate op is present.
// `normalize` is reserved for Phase 2 (operator size-channel space-filling);
// it type-checks here but throws a clear "not yet supported" error wherever
// it would be evaluated.
//
// Only type-only imports from `data.ts` (no runtime import) so `data.ts` can
// import THIS module's class at runtime without a cycle.
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

  /** Aggregate override: sum this field across the group. Valid only in a
   *  value (size/pos) slot. */
  sum(): FieldExpr {
    return this._withOp({ op: "sum" });
  }

  /** Aggregate override: average this field across the group. Valid only in
   *  a value (size/pos) slot. */
  mean(): FieldExpr {
    return this._withOp({ op: "mean" });
  }

  /** Aggregate override: the number of rows in the group (ignores the field's
   *  own values). Valid only in a value (size/pos) slot. */
  count(): FieldExpr {
    return this._withOp({ op: "count" });
  }

  /** Aggregate override: the number of distinct values of this field within
   *  the group. Valid only in a value (size/pos) slot. */
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

/** The Phase-2 "not yet supported" error, shared so both slots throw the
 *  identical message. */
export const normalizeNotSupportedError = (): Error =>
  new Error(
    "field(...).normalize() is only supported on an operator's size channel"
  );
