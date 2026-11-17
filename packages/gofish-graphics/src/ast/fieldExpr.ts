// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// Field-expression pipeline syntax: `field("name")` returns a chainable
// expression — like a Polars column expression — where each method appends one
// op to an ordered pipeline. Order matters: `.bin().sort()` bins first, then
// sorts the resulting bins.
//
// Two disjoint slots consume the pipeline:
//   - DOMAIN ops (`sort`/`reverse`/`bin`/`dropNulls`) apply to a `by` grouping key — see
//     `splitEntries` in datumProjection.ts, the shared split+ops helper used
//     by spread/group/scatter.
//   - VALUE ops compute a value channel's values: maps (`map`, and the
//     built-in `normalize`), then at most one fold (`reduce`, and the named
//     `sum`/`mean`/`median`/`count`/`distinct`, each a built-in callback),
//     then the members of a lifted result — all on one path, `evalGroup`
//     below. Expression evaluation is ORTHOGONAL to the channel's default
//     aggregation (sum for size, mean for pos): the channel applies its
//     default exactly as it always did, and over the singleton a fold
//     produces, sum and mean are both the identity. Neither side knows about
//     the other.
//   - On an operator's (`spread`/`stack`) entry-flagged `size` channel, the
//     maps at the end of an expression with no fold run over the entries'
//     values, the window, instead of a group's rows — see
//     `hasWindowMaps`/`splitWindowMaps`/`applyWindowMaps` below. That is
//     how `normalize` gives each entry its share.
//
// Only type-only imports from `data.ts` (no runtime import) so `data.ts` can
// import THIS module's class at runtime without a cycle.
import type { MaybeValue } from "./data";
import { median } from "d3-array";
import { checkSummable, COUNT, type Quantity } from "./measure";
import { withWire, wireOf } from "./wire";
import {
  binStepToJSON,
  checkBinStep,
  checkChain,
  DEFAULT_PARTITION,
  type BinStep,
  type BinStepJSON,
  type NumberPartition,
  type Partition,
} from "./cells";
import type { CalendarPartition, CalendarUnit } from "./calendar";
import { identity, type Fun } from "./fun";
import type { HasUnit } from "./schema";
import type {
  FunctionExpr,
  Lift,
  LiftError,
  Units,
  ValueExpr,
} from "./groupExpr";
import { distQuantities, sample, sampleIn, type Dist } from "./dist";
import { cellOn } from "./groupCell";
import { evalDistGroup, isDistExpr, type DistExprWire } from "./distExpr";

/** The calendar levels that are a part of nothing, so a bin of one alone
 *  gives cells of the time line. */
type LineUnit = "week" | "year";

/** Type-level: whether a key binned by `S` first has a REGION
 *  ({@link FieldExpr.hasRegion}): cells of the line do, parts of a cycle
 *  (`Calendar.month`, the month of the year) do not. A product has one when
 *  its first level does. */
export type RegionOf<S> = S extends readonly [infer H, ...unknown[]]
  ? RegionOf<H>
  : S extends CalendarPartition<infer U>
    ? [U] extends [LineUnit]
      ? true
      : [U] extends [Exclude<CalendarUnit, LineUnit>]
        ? false
        : boolean
    : true;

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
  | {
      op: "bin";
      /** The partition the values are binned into (cells.ts), or a product
       *  of calendar levels (a list): a builder value in JS, or its wire
       *  form from the IR. Absent: about 10 cells (`DEFAULT_PARTITION`). A
       *  second `bin` op splits the cells of the one before it. */
      partition?: BinStep | BinStepJSON;
    }
  | { op: "dropNulls" }
  | { op: "normalize" }
  | { op: "sum" }
  | { op: "mean" }
  | { op: "median" }
  | { op: "count" }
  | { op: "distinct" }
  /** `map(fn, { unit })`: each value to a new one, `fn(x, i, xs)`. A JS
   *  `fn` has no wire form; a Python one is a bridge handle. */
  | { op: "map"; fn: unknown; unit?: UnitSpec }
  /** `reduce(fn, { unit })`: all the values to one result, `fn(xs)`. */
  | { op: "reduce"; fn: unknown; unit?: UnitSpec }
  /** The group's values as a sample, a distribution (`Dist.sample` in
   *  dist.ts), read through its members: `field("x").density()` is
   *  `sample` then the member `density`. */
  | { op: "sample" }
  /** A member of a reduce's result, read with `args`: `s.lo()`,
   *  `s.quantile(0.9)`. */
  | { op: "member"; name: string; args?: unknown[] };

/** The field-expression wire shape — what `FieldExpr#toJSON` emits and what
 *  the Python bridge/deserializer produces directly (no class involved). */
export type FieldExprWire = {
  type: "field";
  name: string;
  ops?: FieldOp[];
};

/**
 * `field(name)` returns an instance of this class. Immutable + chainable,
 * mirroring `DatumValueImpl` in data.ts: each method returns a NEW instance
 * with one more op appended (own fields, so they survive object spread), and
 * `toJSON` writes the canonical {@link FieldExprWire} shape. Evaluation sites
 * read ops off either form via {@link getFieldOps}.
 */
export class FieldExpr<
  HasRegion extends boolean = boolean,
  Binned extends boolean = boolean,
> {
  public readonly type = "field" as const;
  /** Type-level only (no runtime field): whether this expression, used as a
   *  grouping key, gives each group a REGION, the interval of a cell. Only
   *  `.bin(p)` makes one (`FieldExpr<true>`), and only with cells of the
   *  line: a part of a cycle (`.bin(Calendar.month)`, the month of the
   *  year) has none. `partition` requires one, so `partition({ by: "date"
   *  })` or `partition({ by: field("date").bin(Calendar.month) })` is a type
   *  error. Domain ops keep the flag; an aggregate folds it away. Plain
   *  `FieldExpr` (`boolean`) accepts either. */
  declare readonly hasRegion?: HasRegion;
  /** Type-level only: whether the expression is binned already, so a
   *  further `.bin(p)` splits its cells (a chain) and keeps their kind. */
  declare readonly binned?: Binned;
  constructor(
    public readonly name: string,
    /** @internal accumulated pipeline ops; read via {@link getFieldOps} */
    public readonly _ops: readonly FieldOp[] = []
  ) {}

  private _withOp<R extends boolean, B extends boolean = Binned>(
    op: FieldOp
  ): FieldExpr<R, B> {
    return new FieldExpr<R, B>(this.name, [...this._ops, op]);
  }

  /** Order groups by an explicit list of group keys — e.g.
   *  `field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"])` for a
   *  domain-specific order that no aggregate expresses. Groups whose key
   *  isn't in the list are appended after, in natural sort order. Valid only
   *  in a `by` (domain) slot. */
  sort(values: (string | number)[]): FieldExpr<HasRegion, Binned>;
  /** Order groups by the SUM of `by` over each group's rows (ascending unless
   *  `order: "desc"`), or by the group key itself when `by` is omitted. Valid
   *  only in a `by` (domain) slot. */
  sort(by?: string, order?: "asc" | "desc"): FieldExpr<HasRegion, Binned>;
  sort(
    byOrValues?: string | (string | number)[],
    order?: "asc" | "desc"
  ): FieldExpr<HasRegion, Binned> {
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
  reverse(): FieldExpr<HasRegion, Binned> {
    return this._withOp({ op: "reverse" });
  }

  /** Map each value to its CELL (cells.ts). `step` is:
   *
   *  - a Calendar value. A level that is a part of a larger one gives its
   *    parts: `Calendar.month` is the month of the year, so all Junes are
   *    one cell, and every month is a cell, empty or not. A level that is a
   *    part of nothing (`Calendar.year`, `Calendar.week`) gives cells of
   *    the time line.
   *  - a product of calendar levels, `[Calendar.year, Calendar.month]`: one
   *    cell where one cell of each level meet, each level a part of the one
   *    before it (the June of 2015, labeled "Jun 2015").
   *  - `Bin.step(size)`, `Bin.thresholds(countOrEdges)` (a count or a list
   *    of edges), or `Bin.quantiles(countOrProbabilities)` (a count or a
   *    list of probabilities); about 10 cells when omitted.
   *
   *  A second `.bin(...)` splits each cell of the first (a chain:
   *  `.bin(Calendar.year).bin(Calendar.month)`, the months of each year), and
   *  each cell keeps the cell it was split from, which an axis shows as a
   *  level of its own. The groups are the cells, in order, over the column's
   *  whole domain in the chart's data, so every group of a split sees the
   *  same cells, and empty cells are kept. A partition takes a label
   *  `.format(fn)`, a function of the cell. Valid only in a `by` (domain)
   *  slot. */
  bin<
    S extends
      | Partition
      | readonly [CalendarPartition, ...CalendarPartition[]] = NumberPartition,
  >(step?: S): FieldExpr<Binned extends true ? HasRegion : RegionOf<S>, true> {
    const checked =
      step !== undefined ? checkBinStep(step, "field(...).bin") : undefined;
    const steps = [
      ...binStepsOf(this._ops, "field(...).bin"),
      checked ?? DEFAULT_PARTITION,
    ];
    checkChain(steps, `field("${this.name}")`);
    return this._withOp({
      op: "bin",
      ...(checked !== undefined ? { partition: checked } : {}),
    });
  }

  /** Drop rows whose value at this field is `null`/`undefined`, BEFORE
   *  grouping — named after polars' `drop_nulls` (pandas `dropna`, tidyr
   *  `drop_na`). Valid only in a `by` (domain) slot. */
  dropNulls(): FieldExpr<HasRegion, Binned> {
    return this._withOp({ op: "dropNulls" });
  }

  /** Space-filling normalization on an operator's (`spread`/`stack`) `size`
   *  channel: replaces each split entry's size with its SHARE of the window
   *  (`v_e / Σv_e` over the operator's own split entries), turning the stack
   *  axis into a space-filling spine — see `applyWindowMaps` below. Valid
   *  only there; anywhere else (a plain value slot, or chained after another
   *  op) it throws a clear error. */
  normalize(): FieldExpr<false> {
    return this._withOp({ op: "normalize" });
  }

  /** `reduce(xs => Σ xs)`: the sum of the group's values, missing values
   *  aside. Valid only in a value (size/pos) slot. */
  sum(): ValueExpr {
    return this._withOp({ op: "sum" }) as unknown as ValueExpr;
  }

  /** `reduce(xs => Σ xs / n)`: the mean of the group's values, missing
   *  values aside. Valid only in a value (size/pos) slot. */
  mean(): ValueExpr {
    return this._withOp({ op: "mean" }) as unknown as ValueExpr;
  }

  /** `reduce(xs => d3.median(xs))`: the median of the group's values (the
   *  type-7 quantile at 0.5: the mean of the two middle values when there is
   *  an even number), missing values aside. Valid only in a value (size/pos)
   *  slot. */
  median(): ValueExpr {
    return this._withOp({ op: "median" }) as unknown as ValueExpr;
  }

  /** `reduce(xs => xs.length)`: the number of rows, in the unit "count".
   *  Valid only in a value (size/pos) slot. */
  count(): ValueExpr {
    return this._withOp({ op: "count" }) as unknown as ValueExpr;
  }

  /** `reduce(xs => new Set(xs).size)`: the number of distinct values, in
   *  the unit "count". Valid only in a value (size/pos) slot. */
  distinct(): ValueExpr {
    return this._withOp({ op: "distinct" }) as unknown as ValueExpr;
  }

  /**
   * Map each value of the group to a new one, `fn(x, i, xs)`, with `xs` all
   * the values. `unit` is the new values' unit; without one their unit is
   * unknown, and they cannot be summed or stacked. In an operator's
   * per-entry size channel, maps with no fold after them run over the
   * entries' values instead (as `normalize` does).
   */
  map(
    fn: (x: any, i: number, xs: any[]) => number,
    options?: { unit?: UnitLike }
  ): FieldExpr<false> {
    return this._withOp({
      op: "map",
      fn,
      ...(options?.unit !== undefined ? { unit: options.unit } : {}),
    });
  }

  /**
   * Fold the group's values into one result, `fn(xs)`, once per group. The
   * result is lifted by its shape ({@link Lift}): a number gives a value, a
   * `Fun` a function of t (for ribbon and line), and a record an object
   * with one method per member, read with `s.lo()` (a method member keeps
   * its arguments, `s.quantile(0.9)`). An array is an error, and nothing
   * chains after a value. `unit` mirrors the result's shape; a number
   * whose unit is not declared cannot be summed or stacked.
   */
  // The unit is checked against the result's shape in the return type, not
  // in a constraint on U: a constraint would contextually type the option
  // before V is inferred from a callback whose parameter is not annotated.
  reduce<V, const U = undefined>(
    fn: (xs: any[]) => V,
    options?: { unit?: U }
  ): [U] extends [undefined]
    ? Lift<V>
    : [U] extends [Units<V>]
      ? Lift<V>
      : LiftError<"the unit option mirrors the result's shape"> {
    return lifted(this.name, [
      ...this._ops,
      {
        op: "reduce",
        fn,
        ...(options?.unit !== undefined
          ? { unit: options.unit as UnitSpec }
          : {}),
      },
    ]) as any;
  }

  /** The group's values as a sample ({@link Dist}): their kernel density,
   *  with area the number of values and Silverman's bandwidth, drawn 3
   *  bandwidths past the least and the greatest value (`Dist.sample` in
   *  dist.ts). It is in the values' count per unit, so the densities of
   *  several groups add up. Valid only in a channel of ribbon or line. */
  density(): FunctionExpr {
    return this._member("density") as FunctionExpr;
  }

  /** `t ↦ t` over the interval {@link FieldExpr.density} is drawn over:
   *  the position channel that reads the density at the mark's parameter.
   *  In the values' unit. */
  support(): FunctionExpr {
    return this._member("support") as FunctionExpr;
  }

  /** The share of the group's values at or below t, over the values' own
   *  range: the inverse of {@link FieldExpr.quantile}, linear between the
   *  values. A ratio. Valid only in a channel of ribbon or line. */
  cdf(): FunctionExpr {
    return this._member("cdf") as FunctionExpr;
  }

  /** The type-7 quantile at `p` of the group's values (R's and numpy's
   *  default), missing values aside: `quantile(0.5)` is `median()`. In the
   *  values' unit. Valid only in a value (size/pos) slot. */
  quantile(p: number): ValueExpr {
    if (!(typeof p === "number" && p >= 0 && p <= 1))
      throw new Error(
        `field("${this.name}").quantile(p): p must be a number in [0, 1], ` +
          `got ${String(p)}.`
      );
    return this._member("quantile", [p]) as ValueExpr;
  }

  /** The member `name` of the group's sample. */
  private _member(name: keyof Dist, args?: unknown[]): unknown {
    return new FieldExpr(this.name, [
      ...this._ops,
      { op: "sample" },
      { op: "member", name, ...(args ? { args } : {}) },
    ]);
  }

  /**
   * A row PREDICATE — not a pipeline op: `field("day").between(lo, hi)` returns
   * `(row) => boolean`, for `filter(...)`. It is deliberately outside the
   * op pipeline (`_ops`), because an op belongs to one of the three value slots
   * (domain / aggregate / normalize) and a predicate belongs to none of them:
   * it never takes part in grouping, folding or scaling, so shoehorning it in
   * would need a fourth slot that every evaluation site must learn to ignore.
   *
   * The comparison is by VALUE (SQL `RANGE`, polars `is_between`), never by row
   * count (Vega's window `frame`), and `closed` spells which ends are inclusive
   * exactly as polars does. A moving window is written as a plain lambda around
   * the bare `between(v, lo, hi)` below, which is where a `timer()` read belongs.
   *
   * The predicate carries its own description (`{ field, between, closed }`,
   * see {@link fieldPredicate}), so a `filter` over it serializes as
   * `{ type: "filter", predicate }`. The description is data beside the
   * function, not an op, so the pipeline stays the three value slots.
   */
  between(
    lo: number,
    hi: number,
    options?: BetweenOptions
    // `any` row, not `unknown`: the predicate is handed to `filter(...)`, whose
    // row type comes from the chart's data, and an `unknown` parameter would
    // fight every concrete row type at the call site.
  ): FieldPredicate {
    // The predicate is outside the op pipeline, so an expression carrying ops
    // would silently drop them (`field("x").bin(Bin.step(10)).between(...)` would test the
    // RAW x). Say so instead of ignoring them.
    if (this._ops.length > 0) {
      throw new Error(
        `field("${this.name}").between(...) does not apply the expression ` +
          `pipeline (${this._ops.map((o) => o.op).join(", ")}): a predicate is ` +
          `not a value slot. Filter on the raw field, or derive the binned/` +
          `sorted column first.`
      );
    }
    return fieldPredicate({
      field: this.name,
      between: [lo, hi],
      ...(options?.closed !== undefined ? { closed: options.closed } : {}),
    });
  }

  toJSON(): FieldExprWire {
    return {
      type: this.type,
      name: this.name,
      ...(this._ops.length ? { ops: this._ops.map(opToJSON) } : {}),
    };
  }
}

/** The keys of a lifted expression that are its own (the expression's
 *  wire and the hooks the runtime probes), not members of its result. */
const OWN_KEYS = new Set([
  "type",
  "name",
  "toJSON",
  "then",
  "constructor",
  "hasRegion",
  "binned",
  "valueOf",
  "toString",
  "toLocaleString",
  "inspect",
  "kind",
  "length",
  "nodeType",
  "$$typeof",
  "asymmetricMatch",
]);

/**
 * A reduce's result, as the spec holds it: the expression, whose every
 * other property is a member of the result, a method that reads it
 * (`s.lo()`, `s.quantile(0.9)`), giving another such expression. The shape
 * of the result is known only when the reduce runs, so a member is checked
 * then ({@link liftLeaf}): a member of a value is an error.
 */
function lifted(name: string, ops: readonly FieldOp[]): unknown {
  return new Proxy(new FieldExpr(name, ops), {
    get(target, key) {
      if (typeof key === "symbol" || OWN_KEYS.has(key) || key.startsWith("_"))
        return Reflect.get(target, key, target);
      return (...args: unknown[]) =>
        lifted(name, [
          ...ops,
          { op: "member", name: key, ...(args.length ? { args } : {}) },
        ]);
    },
  });
}

/** One op's wire form: a `bin` op's partition is written as its wire form
 *  (a loud error for a partition with a JS `format`). A FieldExpr's bin op
 *  holds the builder form, which `.bin()` checked. */
const opToJSON = (op: FieldOp): FieldOp =>
  op.op === "bin" && op.partition !== undefined
    ? { op: "bin", partition: binStepToJSON(op.partition as BinStep) }
    : op;

export type BetweenOptions = {
  /** Which ends of the interval are inclusive. Default `"both"` — polars
   *  `is_between`'s `closed` verbatim. */
  closed?: "both" | "left" | "right" | "none";
};

/**
 * A field predicate as data: the field it reads and the interval it tests,
 * exactly what `field(name).between(lo, hi, { closed })` was called with. It is
 * the `predicate` of a `filter` operator on the wire
 * (`{ type: "filter", predicate }`).
 */
export type FieldPredicateWire = {
  field: string;
  between: [number, number];
  closed?: BetweenOptions["closed"];
};

/** A row predicate that also carries its own description as data (its wire
 *  form, `withWire`), so `filter` can put it on the wire. */
export type FieldPredicate = (row: any) => boolean;

/**
 * Build the row predicate a {@link FieldPredicateWire} describes. Both
 * `field(name).between(...)` and the IR deserializer go through here, so the
 * predicate a chart runs and the one it serializes are the same value.
 */
export function fieldPredicate(wire: FieldPredicateWire): FieldPredicate {
  const [lo, hi] = wire.between;
  const options = wire.closed !== undefined ? { closed: wire.closed } : {};
  const pred = (row: unknown) =>
    between(
      (row as Record<string, unknown> | undefined)?.[wire.field] as number,
      lo,
      hi,
      options
    );
  return withWire(pred, wire);
}

/** The wire description a predicate carries, if it is a field predicate. A
 *  hand-written `(row) => boolean` has none. */
export function predicateWire(pred: unknown): FieldPredicateWire | undefined {
  return wireOf<FieldPredicateWire>(pred);
}

/**
 * `between(v, lo, hi, { closed })` — is `v` inside the interval? `closed`
 * chooses which ends count, defaulting to `"both"`, after polars' `is_between`.
 * A window that follows a `timer()` is a plain lambda that reads the clock and
 * calls this, which is how every caller spells it.
 *
 * The closed-on-both-ends case is `contains` in `util/interval.ts`, over an
 * `Interval` value; this form takes the ends loose because a row predicate has
 * no interval object to hand.
 */
export function between(
  v: number,
  lo: number,
  hi: number,
  options?: BetweenOptions
): boolean {
  const closed = options?.closed ?? "both";
  const lowOk = closed === "both" || closed === "left" ? v >= lo : v > lo;
  const highOk = closed === "both" || closed === "right" ? v <= hi : v < hi;
  return lowOk && highOk;
}

/**
 * Read the pipeline ops off a field accessor, in either of its two forms: a
 * JS {@link FieldExpr} instance (ops in `_ops`; `.sort()`/`.bin()`/etc. are
 * the chaining methods) or the deserialized wire shape (a plain object with
 * an `ops` array, as the Python wrapper / IR emits). Mirrors
 * `getValueOffset`/`getValueColorOps` in data.ts. Non-field accessors (a bare
 * string, a function, a number, a literal) carry no ops.
 */
export function getFieldOps(accessor: unknown): readonly FieldOp[] {
  if (accessor instanceof FieldExpr) return accessor._ops;
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

/** The bin steps of a field expression's `bin` ops, in order, each checked
 *  as written (`checkBinStep`); a `bin` op with no partition bins into
 *  about 10 cells (`DEFAULT_PARTITION`). */
export const binStepsOf = (ops: readonly FieldOp[], where: string): BinStep[] =>
  ops.flatMap((op) =>
    op.op === "bin"
      ? [checkBinStep(op.partition ?? DEFAULT_PARTITION, where)]
      : []
  );

/** Domain op names — valid only on a `by` (grouping) slot. */
const DOMAIN_OPS = new Set(["sort", "reverse", "bin", "dropNulls"]);

export const isDomainOp = (op: FieldOp): boolean => DOMAIN_OPS.has(op.op);

/** Whether `v` is a missing value: null or undefined, as everywhere in
 *  GoFish (`dropNulls`, the schema's traits). A fold skips it. NaN is a
 *  number, not a missing value. */
export const isMissing = (v: unknown): v is null | undefined => v == null;

/** The values of `values` that are not missing ({@link isMissing}). */
const present = (values: readonly unknown[]): number[] =>
  values.filter((v) => !isMissing(v)) as number[];

/** The mean of the values of `values` that are not missing, or undefined
 *  when there are none (no rows, or only missing values): a mean has no
 *  value to fall back to, so a channel read as one has no value. */
export const meanOf = (values: readonly unknown[]): number | undefined => {
  const vs = present(values);
  return vs.length === 0
    ? undefined
    : vs.reduce((a, b) => a + b, 0) / vs.length;
};

/** The median of the values of `values` that are not missing (d3's
 *  `median`, the type-7 quantile at 0.5), or undefined when there are none,
 *  as for {@link meanOf}. */
export const medianOf = (values: readonly unknown[]): number | undefined =>
  median(present(values));

/** The sum of the values of `values` that are not missing. Over no rows it
 *  is 0, the sum of nothing. Over rows whose values are all missing it is
 *  undefined, as in SQL: their sum is unknown, not 0. */
export const sumOf = (values: readonly unknown[]): number | undefined => {
  const vs = present(values);
  return vs.length === 0 && values.length > 0
    ? undefined
    : vs.reduce((a, b) => a + b, 0);
};

/** {@link sumOf}, checked: the sum `where` takes of values of quantity
 *  `quantity`, whose unit must add up (`checkSummable`, #1197). */
export const sumIn = (
  values: readonly unknown[],
  quantity: Quantity | undefined,
  where: string
): number | undefined => {
  checkSummable(quantity, where);
  return sumOf(values);
};

// ---------------------------------------------------------------------------
// Evaluating a field expression over a group's rows.
//
// One path evaluates every expression: `evalGroup`. The pipeline is read in
// three parts, in order:
//
//   1. maps, each a function of all the values (`map`'s `(x, i, xs) => y`
//      run on each value; `normalize` is the built-in map `x / Σxs`);
//   2. at most one fold, a function of all the values to one result (a
//      user's `reduce(xs => ...)`, or one of the named methods, each a
//      built-in callback: `sum`, `mean`, `median`, `count`, `distinct`);
//   3. the members a lifted result is read through (`s.lo()`).
//
// A user's map or reduce runs once per group: its result is kept by the op
// and the rows it ran on (`stepCache`).

/** A unit as the `unit` option of `map` or `reduce` takes it: a unit's
 *  name, a unit definition (`Unit("USD")`), or the wire form of its traits
 *  (`{ HasUnit }`, which Python sends). */
export type UnitLike =
  | string
  | { readonly type: { readonly HasUnit?: HasUnit } }
  | { readonly HasUnit?: HasUnit };

/** The `unit` option of `map` or `reduce`: one unit for every number of the
 *  result, or a record that mirrors the result's shape, a unit (or a record)
 *  per member. */
export type UnitSpec = UnitLike | { readonly [member: string]: UnitSpec };

/** The {@link HasUnit} a unit stands for, or undefined when `u` is no unit
 *  (a record of units, or nothing). */
const hasUnitOf = (u: unknown): HasUnit | undefined => {
  if (typeof u === "string") return { unit: u, symbol: u };
  if (u === null || typeof u !== "object") return undefined;
  const t = (u as any).type;
  if (t !== null && typeof t === "object" && "HasUnit" in t) return t.HasUnit;
  if ("HasUnit" in u) return (u as any).HasUnit;
  return undefined;
};

/** The quantity of values whose unit is not declared: amounts of the
 *  unknown unit of what `where` computed, which do not add up (they have no
 *  CanSum), so they cannot be summed or stacked (`checkSummable` says to
 *  declare the unit). */
const undeclaredQuantity = (name: string, where: string): Quantity => ({
  name,
  unit: { unit: where, traits: {} },
  undeclared: where,
});

/**
 * The quantity of the number at `path` in the result of `where`, given the
 * `unit` option. One unit is the unit of every number below it; a record
 * gives the unit of each member, and a member it does not name has no
 * declared unit. A record where the result has a number is an error: the
 * option mirrors the result's shape.
 */
function quantityAt(
  name: string,
  unit: unknown,
  path: readonly string[],
  where: string
): Quantity {
  let u = unit;
  for (const key of path) {
    if (u === undefined || hasUnitOf(u) !== undefined) break;
    u = (u as Record<string, unknown>)[key];
  }
  if (u === undefined) return undeclaredQuantity(name, where);
  const hasUnit = hasUnitOf(u);
  if (hasUnit === undefined)
    throw new Error(
      `${where}: the unit option mirrors the result's shape, but at ` +
        `${path.length === 0 ? "the result" : `.${path.join("().")}()`} it ` +
        `is a record (${Object.keys(u as object).join(", ")}) where the ` +
        `result has a number. Give one unit there.`
    );
  return { name, unit: hasUnit };
}

const RESOLVE_ROWS_KEY = Symbol.for("gofish.resolveRows");

/** A Python callback: a function with a batch form, which only the bridge
 *  can run (`makeLambdaAccessor` in serialize/fromJSON.ts). It is resolved
 *  for every group before the synchronous passes read it
 *  ({@link resolveGroupSteps}). */
const isBatchFn = (
  fn: unknown
): fn is {
  [RESOLVE_ROWS_KEY]: (inputs: readonly unknown[]) => Promise<unknown[]>;
} => typeof fn === "function" && RESOLVE_ROWS_KEY in fn;

/** What a step computed for a group, by its op and the rows it ran on: each
 *  user callback runs once per group. Named steps are kept too, so every
 *  step takes the one path. */
const stepCache = new WeakMap<object, WeakMap<object, { v: unknown }>>();
const cachedStep = (
  op: object,
  rows: object,
  where: string,
  compute: () => unknown
): unknown => {
  let byRows = stepCache.get(op);
  if (byRows === undefined) stepCache.set(op, (byRows = new WeakMap()));
  const hit = byRows.get(rows);
  if (hit !== undefined) return hit.v;
  if (isBatchFn((op as any).fn))
    throw new Error(
      `${where} is a Python callback, read on a group it was not resolved ` +
        `over. Its groups must be resolved before inference ` +
        `(resolveGroupSteps).`
    );
  const v = compute();
  byRows.set(rows, { v });
  return v;
};
const storeStep = (op: object, rows: object, v: unknown): void => {
  let byRows = stepCache.get(op);
  if (byRows === undefined) stepCache.set(op, (byRows = new WeakMap()));
  byRows.set(rows, { v });
};

/** The shares `x / Σxs` of `xs` ({@link normalizeAll}'s values), and what
 *  `where` warns when the total has no shares. */
function sharesOf(
  xs: readonly unknown[],
  quantity: Quantity | undefined
): number[] {
  const nums = xs.map((x) => Number(x));
  // The total adds the values. A missing one is NaN, so the total is NaN,
  // and every share 0.
  const total = sumIn(nums, quantity, "field(...).normalize()");
  if (total === undefined || !(total > 0)) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(
        `field(...).normalize(): the entry total is ${total} (≤ 0), so ` +
          `every share is 0. Check that the size field/aggregate produces ` +
          `positive values.`
      );
    }
    return nums.map(() => 0);
  }
  return nums.map((n) => n / total);
}

/** A map step: all the values to all the new values, and the quantity of
 *  the new values given the quantity of the old ones. */
type MapStep = {
  op: FieldOp & object;
  all: (xs: readonly unknown[], quantity: Quantity | undefined) => unknown[];
  quantity: (base: Quantity | undefined) => Quantity | undefined;
};

/** A fold step: all the values to one result. A named one says what the
 *  quantity of its number is; a fold whose result is lifted (a user's
 *  reduce, a sample) says the quantity of each leaf. */
type FoldStep = {
  op: FieldOp & object;
  /** `of` is given when `xs` are the values of the column `of.name` over
   *  `of.rows`, as they are, with no map before the fold. */
  fn: (xs: readonly unknown[], of?: ColumnValues) => unknown;
  /** Checks run on the values' quantity before the fold (`sum` adds). */
  check?: (quantity: Quantity | undefined) => void;
  /** A named fold's quantity, given the values' quantity; undefined keeps
   *  the column's (the caller's). */
  quantity?: (base: Quantity | undefined) => Quantity | undefined;
  /** A fold whose result is lifted by its shape ({@link liftLeaf}), read
   *  through members: the quantity of the leaf at `path`, given the
   *  values' quantity. */
  lift?: (base: Quantity | undefined) => LeafQuantity;
  /** What the lift's messages call the fold. */
  where?: string;
};

/** Where a fold's values come from: the column `name` over `rows`. */
type ColumnValues = { name: string; rows: readonly unknown[] };

/**
 * The sample of a group's values of a column. In a cell of the column's
 * line (groupCell.ts) it is the whole group's sample restricted to the cell
 * (`sampleIn`): the cell's values with the whole sample's density over the
 * cell, so the cells of one density meet. Anywhere else, and over values
 * a map made, it is the values' own.
 */
function groupSample(
  op: object,
  xs: readonly unknown[],
  of: ColumnValues | undefined
): Dist {
  const cell =
    of === undefined
      ? undefined
      : cellOn(of.rows, { kind: "column", name: of.name });
  if (cell === undefined) return sample(xs);
  const name = of!.name;
  const whole = cachedStep(op, cell.whole, `field("${name}")`, () =>
    groupSample(
      op,
      cell.whole.map((r) => (r as Record<string, unknown> | null)?.[name]),
      { name, rows: cell.whole }
    )
  ) as Dist;
  return sampleIn(xs, whole, cell.cell);
}

/** The quantity of a lifted result's leaf at `path` (its members, in
 *  order), a value or a function; undefined keeps the column's. */
export type LeafQuantity = (
  path: readonly string[],
  kind: "value" | "function"
) => Quantity | undefined;

/** The leaf quantities of a {@link Dist} over values of quantity `variable`
 *  (`distQuantities`): a function's `support()` is in the variable, as the
 *  Dist's own `support` is. */
export const distLeafQuantity = (
  variable: Quantity,
  mass: Quantity
): LeafQuantity => {
  const q = distQuantities(variable, mass);
  return (path) =>
    path[path.length - 1] === "support" ? q.support : q[path[0] as keyof Dist];
};

/**
 * The named methods, each a built-in callback of `reduce`: what `sum`,
 * `mean`, `median`, `count` and `distinct` stand for. Each skips missing
 * values as SQL does, except `count`, the number of rows.
 */
export const NAMED_FOLDS = {
  /** `xs => Σ xs` (missing values aside); the values' unit must add up. */
  sum: {
    fn: (xs: readonly unknown[]) => sumOf(xs),
    check: (q: Quantity | undefined) => checkSummable(q, "field(...).sum()"),
  },
  /** `xs => Σ xs / n` (missing values aside). */
  mean: { fn: (xs: readonly unknown[]) => meanOf(xs) },
  /** `xs => d3.median(xs)` (missing values aside). */
  median: { fn: (xs: readonly unknown[]) => medianOf(xs) },
  /** `xs => xs.length`, in the unit "count". */
  count: {
    fn: (xs: readonly unknown[]) => xs.length,
    quantity: () => COUNT_QUANTITY,
  },
  /** `xs => new Set(xs).size`, in the unit "count". */
  distinct: {
    fn: (xs: readonly unknown[]) => new Set(xs).size,
    quantity: () => COUNT_QUANTITY,
  },
} as const;

/** The step `op` is, or undefined for an op that is no step of a value
 *  (a domain op). */
function stepOf(
  op: FieldOp,
  name: string,
  byName: string | undefined
): { map: MapStep } | { fold: FoldStep } | { member: MemberOp } | undefined {
  switch (op.op) {
    case "normalize":
      return {
        map: {
          op,
          all: (xs, q) => sharesOf(xs, q),
          quantity: (base) => shareQuantity(base, byName),
        },
      };
    case "map": {
      const where = `field("${name}").map(...)`;
      const fn = op.fn as (
        x: unknown,
        i: number,
        xs: readonly unknown[]
      ) => unknown;
      return {
        map: {
          op,
          all: (xs) => xs.map((x, i) => fn(x, i, xs)),
          quantity: () => quantityAt(name, op.unit, [], where),
        },
      };
    }
    case "reduce": {
      const where = `field("${name}").reduce(...)`;
      return {
        fold: {
          op,
          fn: op.fn as (xs: readonly unknown[]) => unknown,
          where,
          // One unit for a function's support keeps the column's quantity:
          // t is an amount of the column.
          lift: () => (path, kind) =>
            kind === "function" &&
            path[path.length - 1] === "support" &&
            hasUnitOf(op.unit) !== undefined
              ? undefined
              : quantityAt(name, op.unit, path, where),
        },
      };
    }
    case "sample":
      return {
        fold: {
          op,
          fn: (xs, of) => groupSample(op, xs, of),
          where: `field("${name}")`,
          lift: (base) => distLeafQuantity(base ?? { name }, COUNT_QUANTITY),
        },
      };
    case "sum":
    case "mean":
    case "median":
    case "count":
    case "distinct":
      return { fold: { op, ...NAMED_FOLDS[op.op] } };
    case "member":
      return { member: op };
    default:
      return undefined;
  }
}

type MemberOp = Extract<FieldOp, { op: "member" }>;

/** An expression's steps, in order and checked: domain ops are not values;
 *  maps come before the one fold, and members after it. */
function stepsOf(
  accessor: unknown,
  name: string,
  byName?: string
): { maps: MapStep[]; fold?: FoldStep; members: MemberOp[] } {
  const maps: MapStep[] = [];
  let fold: FoldStep | undefined;
  const members: MemberOp[] = [];
  for (const op of getFieldOps(accessor)) {
    const step = stepOf(op, name, byName);
    if (step === undefined)
      throw new Error(
        `field(...).${op.op}() is a domain (\`by\`) op — it isn't valid on ` +
          `a value channel (e.g. a size/pos channel like this one).`
      );
    if ("map" in step) {
      if (fold !== undefined) throw liftChainError(name, fold.op, op.op);
      maps.push(step.map);
    } else if ("fold" in step) {
      if (fold !== undefined) {
        if (fold.lift === undefined && op.op !== "reduce")
          throw new Error(
            `field(...) can only carry one aggregate op; found ${fold.op.op}, ${op.op}.`
          );
        throw liftChainError(name, fold.op, op.op);
      }
      fold = step.fold;
    } else {
      if (fold === undefined)
        throw new Error(
          `field("${name}"): .${step.member.name}() reads a member of a ` +
            `reduce's result, but there is no reduce before it.`
        );
      if (fold.lift === undefined) throw liftChainError(name, fold.op, op.op);
      members.push(step.member);
    }
  }
  return { maps, fold, members };
}

/** The error for an op chained after a value: a fold's result is a value
 *  (or a function), not a column, so nothing chains after it. */
const liftChainError = (name: string, fold: FieldOp, next: string): Error =>
  new Error(
    `field("${name}").${fold.op}(...).${next}(...): ${fold.op} gives one ` +
      `value per group, and nothing chains after a value. Put ` +
      `${next === "map" || next === "normalize" ? `.${next}(...) before .${fold.op}(...)` : `the computation inside one reduce`}.`
  );

/** Whether `v` is a function value (`Fun`): an `at` and a domain. */
const isFunLike = (v: unknown): v is Fun<number> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as any).at === "function" &&
  typeof (v as any).domain === "object" &&
  (v as any).domain !== null &&
  typeof (v as any).domain.min === "number";

const isRecordLike = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !isFunLike(v);

const shapeName = (v: unknown): string =>
  Array.isArray(v) ? "an array" : v === null ? "null" : typeof v;

/** One group's value of an expression: the rows' values (no fold), one
 *  value, or one function. Each carries the quantity of its numbers when
 *  the pipeline says it (else the caller's column's). */
export type GroupResult =
  | { kind: "rows"; values: unknown[]; quantity?: Quantity }
  | { kind: "value"; value: unknown; quantity?: Quantity }
  | { kind: "function"; fun: Fun<number>; quantity?: Quantity };

/**
 * Lift a reduce's result to a leaf, through the members read after it: a
 * number (or no value: null or undefined) is a value; a `Fun` is a function;
 * a record is read through its members, a method member called with its
 * args, until a leaf. An array, a record at the end, or a member of a leaf
 * (other than a function's `support()`) is an error.
 */
export function liftLeaf(
  result: unknown,
  members: readonly MemberOp[],
  where: string,
  quantityOf: LeafQuantity
): GroupResult {
  let v = result;
  const path: string[] = [];
  let read = where;
  for (const m of members) {
    const args = m.args ?? [];
    if (Array.isArray(v))
      throw new Error(
        `${read} is an array. A reduce returns a number, a function or a ` +
          `record of them; for several values, return a record ` +
          `({ lo, hi }) and read its members.`
      );
    if (isFunLike(v)) {
      if (m.name === "support" && args.length === 0) {
        v = identity(v.domain);
        path.push("support");
        read += ".support()";
        continue;
      }
      throw new Error(
        `${read}.${m.name}(): ${read} is a function of t, and nothing ` +
          `chains after it but .support().`
      );
    }
    if (!isRecordLike(v))
      throw new Error(
        `${read}.${m.name}(): ${read} is ${shapeName(v)}, which has no ` +
          `members; nothing chains after a value.`
      );
    if (!(m.name in v))
      throw new Error(
        `${read}.${m.name}(): the record has no member ${m.name}; its ` +
          `members are ${Object.keys(v).join(", ")}.`
      );
    const member = v[m.name];
    if (typeof member === "function") v = member.apply(v, args);
    else if (args.length > 0)
      throw new Error(
        `${read}.${m.name}(...): ${m.name} is not a method, so it takes no ` +
          `arguments.`
      );
    else v = member;
    path.push(m.name);
    read += `.${m.name}()`;
  }
  if (v === null || v === undefined || typeof v === "number") {
    const quantity = quantityOf(path, "value");
    return {
      kind: "value",
      value: v ?? undefined,
      ...(quantity ? { quantity } : {}),
    };
  }
  if (isFunLike(v)) {
    const quantity = quantityOf(path, "function");
    return { kind: "function", fun: v, ...(quantity ? { quantity } : {}) };
  }
  if (Array.isArray(v))
    throw new Error(
      `${read} is an array. A reduce returns a number, a function or a ` +
        `record of them; for several values, return a record ({ lo, hi }) ` +
        `and read its members.`
    );
  if (isRecordLike(v))
    throw new Error(
      `${read} is a record (${Object.keys(v).join(", ")}), but a channel ` +
        `takes a number or a function. Read a member: ${read}.` +
        `${Object.keys(v)[0] ?? "member"}().`
    );
  throw new Error(
    `${read} is ${shapeName(v)}, but a reduce returns a number, a function ` +
      `or a record of them.`
  );
}

/** The value `accessor` reads off a row. */
const keyOf = <T>(
  accessor: string | ((r: T) => unknown) | FieldExprWire | FieldExpr
): ((r: T) => unknown) =>
  typeof accessor === "function"
    ? accessor
    : (r: any) => r?.[typeof accessor === "string" ? accessor : accessor.name];

/**
 * Evaluate a field expression (or a bare string or function accessor) over
 * one group's rows: the one place an expression is evaluated.
 *
 * - Its maps run on the rows' values in order, each a function of all of
 *   them; a map gives its values the quantity its `unit` declares (none
 *   declared: an unknown unit that does not add up), and `normalize` gives
 *   shares.
 * - Its fold, when it has one, runs once on the mapped values. A named
 *   fold's number keeps the column's quantity, except a count's; `sum`
 *   checks that its values add up first (`checkSummable`, #1197). A user's
 *   reduce is lifted by its result's shape ({@link liftLeaf}).
 * - With no fold, the result is the rows' values, which a channel folds
 *   itself (sum for a size, mean for a position).
 *
 * `column` is the quantity of the column the accessor reads (`resolveColumn`
 * in channels.ts), undefined when it reads none. `byName` names the field an
 * operator's entries are split by, which a share's quantity is qualified by.
 */
export function evalGroup<T>(
  accessor:
    | string
    | ((r: T) => unknown)
    | FieldExprWire
    | FieldExpr
    | DistExprWire,
  rows: readonly T[],
  column: Quantity | undefined,
  byName?: string
): GroupResult {
  // A distribution expression's result is its Dist, read through its
  // members by the same lift as a reduce's.
  if (isDistExpr(accessor)) return evalDistGroup(accessor, rows);
  const name =
    typeof accessor === "string"
      ? accessor
      : typeof accessor === "function"
        ? "value"
        : accessor.name;
  const { maps, fold, members } = stepsOf(accessor, name, byName);
  const key = keyOf(accessor);
  let xs: unknown[] = rows.map(key);
  let quantity = column;
  for (const step of maps) {
    const base = quantity;
    xs = cachedStep(step.op, rows, `field("${name}").map(...)`, () =>
      step.all(xs, base)
    ) as unknown[];
    quantity = step.quantity(base);
  }
  const mapped = maps.length > 0;
  if (fold === undefined)
    return { kind: "rows", values: xs, ...(mapped ? { quantity } : {}) };
  fold.check?.(quantity);
  const values = xs;
  // The values are a column's, as they are, when no map ran and the
  // accessor names a column.
  const of =
    mapped || typeof accessor === "function" ? undefined : { name, rows };
  const result = cachedStep(fold.op, rows, `field("${name}").reduce(...)`, () =>
    fold.fn(values, of)
  );
  if (fold.lift === undefined) {
    const q = fold.quantity?.(quantity) ?? (mapped ? quantity : undefined);
    return { kind: "value", value: result, ...(q ? { quantity: q } : {}) };
  }
  return liftLeaf(result, members, fold.where!, fold.lift(quantity));
}

/**
 * Evaluate a value channel's expression over a group's rows: the rows'
 * values, or, when the pipeline folds, the singleton of its value (`folded`
 * says which). A channel that aggregates (sum for a size, mean for a
 * position) folds the rows' values itself, and takes a folded value as it
 * is. A function (a reduce that returns one) is an error here: only the
 * shape form of ribbon and line reads functions.
 */
export function evalFieldValues<T>(
  accessor: string | ((r: T) => unknown) | FieldExprWire | FieldExpr,
  rows: T[],
  column: Quantity | undefined
): { values: unknown[]; folded: boolean; quantity?: Quantity } {
  const r = evalGroup(accessor, rows, column);
  if (r.kind === "rows")
    return { values: r.values, folded: false, quantity: r.quantity };
  if (r.kind === "value")
    return { values: [r.value], folded: true, quantity: r.quantity };
  throw new Error(
    `[gofish] field("${(accessor as FieldExpr).name}").reduce(...) gives ` +
      `a function of t here, but this channel takes one value per group. ` +
      `Only ribbon and line read functions, every function channel at one ` +
      `t: ribbon({ x: f.support(), h: f }).`
  );
}

/** What `.count()` and `.distinct()` report: counts, read from no column,
 *  which add up. */
const COUNT_QUANTITY: Quantity = { name: "count", unit: COUNT };

/**
 * Resolve the Python callbacks of an expression's maps and reduce for every
 * group in `groups`, so the synchronous passes read them from the step cache
 * ({@link evalGroup}): each callback is one bridge call, with one input per
 * group (the group's values, a list), and the reply has one result per
 * group. JS steps before a Python one run here too, on the same path.
 */
export async function resolveGroupSteps(
  accessor: unknown,
  groups: readonly (readonly unknown[])[]
): Promise<void> {
  const ops = getFieldOps(accessor);
  if (!ops.some((op) => isBatchFn((op as any).fn))) return;
  const wire = accessor as FieldExprWire;
  const { maps, fold } = stepsOf(accessor, wire.name);
  const key = keyOf(wire);
  let xsPer: unknown[][] = groups.map((rows) => rows.map(key));
  const run = async (op: FieldOp & object, local: (i: number) => unknown) => {
    const fn = (op as any).fn;
    if (!isBatchFn(fn))
      return groups.map((rows, i) => cachedStep(op, rows, "", () => local(i)));
    const todo = groups.map((rows) => stepCache.get(op)?.get(rows));
    if (todo.every((hit) => hit !== undefined))
      return todo.map((hit) => hit!.v);
    const out = await fn[RESOLVE_ROWS_KEY](xsPer);
    groups.forEach((rows, i) => storeStep(op, rows, out[i]));
    return out;
  };
  for (const step of maps) {
    const prev = xsPer;
    xsPer = (await run(step.op, (i) =>
      step.all(prev[i], undefined)
    )) as unknown[][];
  }
  if (fold !== undefined) {
    const prev = xsPer;
    await run(fold.op, (i) => fold.fn(prev[i]));
  }
}

/** Whether `v`'s result has a shape known only per group, a function or a
 *  value: it holds a reduce or a sample, or it is a distribution
 *  expression. */
export const liftsPerGroup = (v: unknown): boolean =>
  isDistExpr(v) ||
  getFieldOps(v).some((op) => op.op === "reduce" || op.op === "sample");

/** Whether a field expression's ops hold a Python callback, which must be
 *  resolved over the groups before inference ({@link resolveGroupSteps}). */
export const holdsBatchStep = (accessor: unknown): boolean =>
  getFieldOps(accessor).some((op) => isBatchFn((op as any).fn));

/** Whether a field expression holds a JS callback (a map's or a reduce's),
 *  which has no wire form. */
export const holdsClosureStep = (accessor: unknown): boolean =>
  getFieldOps(accessor).some(
    (op) => typeof (op as any).fn === "function" && !isBatchFn((op as any).fn)
  );

/** The maps at the end of an expression with no fold: in an operator's
 *  per-entry size channel they run over the entries' values (the window),
 *  not over a group's rows. */
export function hasWindowMaps(accessor: unknown): boolean {
  const ops = getFieldOps(accessor);
  const last = ops[ops.length - 1];
  return (
    last !== undefined &&
    (last.op === "map" || last.op === "normalize") &&
    !ops.some((op) => stepOfKind(op) === "fold")
  );
}

const stepOfKind = (op: FieldOp): "map" | "fold" | "member" | "domain" =>
  op.op === "map" || op.op === "normalize"
    ? "map"
    : op.op === "reduce" || op.op === "sample" || op.op in NAMED_FOLDS
      ? "fold"
      : op.op === "member"
        ? "member"
        : "domain";

/**
 * Split an expression for an operator's per-entry size channel: `pre` is
 * the expression without its trailing maps, which each entry evaluates as
 * any size accessor (the channel's own sum over the entry's rows); `maps`
 * are the trailing maps, which {@link applyWindowMaps} runs over the
 * entries' values. With no fold, an expression's trailing maps run at the
 * level the channel gives values at: rows in a mark, entries here.
 */
export function splitWindowMaps(
  accessor: string | ((r: any) => unknown) | FieldExprWire | FieldExpr
): {
  pre: string | ((r: any) => unknown) | FieldExprWire | FieldExpr;
  maps: FieldOp[];
} {
  if (!hasWindowMaps(accessor)) return { pre: accessor, maps: [] };
  const ops = getFieldOps(accessor);
  let i = ops.length;
  while (i > 0 && stepOfKind(ops[i - 1]) === "map") i--;
  const name =
    accessor instanceof FieldExpr ? accessor.name : (accessor as any).name;
  const preOps = ops.slice(0, i);
  const pre: FieldExprWire = {
    type: "field",
    name,
    ...(preOps.length ? { ops: preOps } : {}),
  };
  return { pre, maps: ops.slice(i) };
}

/** Duck-typed read of a `Value<number>`'s `.datum`/`.quantity`, without a
 *  runtime dependency on data.ts's `isValue`/`getValue`/`getQuantity` (this
 *  module must not import data.ts at runtime — see the file header). Mirrors
 *  their identical `.type === "datum"` check; a plain object literal with
 *  this shape IS the wire form those functions already accept. */
const isDatumValue = (
  v: unknown
): v is { type: "datum"; datum: unknown; quantity?: Quantity } =>
  typeof v === "object" && v !== null && (v as any).type === "datum";
const numericDatum = (v: MaybeValue<number>): number =>
  isDatumValue(v) ? Number(v.datum) : Number(v);
const datumQuantity = (v: MaybeValue<number>): Quantity | undefined =>
  isDatumValue(v) ? v.quantity : undefined;

/**
 * The quantity of a share: a share is a NEW unit (0–1, not the base
 * quantity's own units), declared, so `"count"` and `"count share"` must
 * never silently union on the same axis — see `joinUnits`' throw in
 * underlyingSpace.ts, which is exactly the type guard this is meant to trigger.
 * `byName`, when present, further qualifies by the grouping field the shares
 * were computed over, so a per-`origin` share and a per-`cylinders` share
 * (two nesting levels of the same mosaic) stay distinct units even though
 * both are "count share". The name doubles as the axis title. The unit has
 * no symbol: a share is a plain number, so the title adds no "(unit)". Shares
 * add up (to 1), so the unit has `CanSum`.
 */
export const shareQuantity = (
  base: Quantity | undefined,
  byName?: string
): Quantity => {
  const name = `${base?.name ?? "value"} share${byName ? ` by ${byName}` : ""}`;
  return { name, unit: { unit: name, traits: { CanSum: {} } } };
};

/**
 * The window stage of an operator's per-entry size channel: given each
 * entry's value of the expression before its trailing maps
 * ({@link splitWindowMaps}), run the maps over the entries' values, the
 * window. `normalize` gives each entry its share `v_e / Σv_e`: a non-positive
 * total has no shares, so every entry gets 0 and a console warning rather
 * than a divide-by-zero or a negative share. A share's quantity is
 * `shareQuantity`'s (see its doc for why that is load-bearing). A user's
 * map gives the quantity its `unit` declares.
 *
 * TODO(stack-profiles): a Python map here is not resolved over the window
 * (`resolveGroupSteps` resolves rows of groups), so it is an error.
 */
export function applyWindowMaps(
  entryValues: MaybeValue<number>[],
  maps: readonly FieldOp[],
  name: string,
  byName?: string
): MaybeValue<number>[] {
  let xs: unknown[] = entryValues.map(numericDatum);
  let quantity = entryValues.map(datumQuantity).find((q) => q !== undefined);
  for (const op of maps) {
    const step = stepOf(op, name, byName);
    if (step === undefined || !("map" in step))
      throw new Error(`field("${name}"): ${op.op} is not a map.`);
    if (isBatchFn((op as any).fn))
      throw new Error(
        `field("${name}").map(...) in an operator's size channel maps the ` +
          `entries' values, and a Python map is not resolved over them yet. ` +
          `Use a JS map, or fold the rows first: .map(...) before .sum().`
      );
    const base = quantity;
    xs = step.map.all(xs, base);
    quantity = step.map.quantity(base);
  }
  const q = quantity;
  return xs.map(
    (x) =>
      ({
        type: "datum",
        datum: x as number,
        ...(q ? { quantity: q } : {}),
      }) as const
  );
}
