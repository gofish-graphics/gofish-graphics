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
import type { MaybeValue } from "./data";
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
  | { op: "count" }
  | { op: "distinct" };

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
   *  - `Bin.step(size)` or `Bin.thresholds(countOrEdges)` (a count or a list
   *    of edges); about 10 cells when omitted.
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
   *  axis into a space-filling spine — see `applyEntryNormalize` below. Valid
   *  only there; anywhere else (a plain value slot, or chained after another
   *  op) it throws a clear error. */
  normalize(): FieldExpr<false> {
    return this._withOp({ op: "normalize" });
  }

  /** Fold the group's rows to the sum of this field. Valid only in a value
   *  (size/pos) slot. */
  sum(): FieldExpr<false> {
    return this._withOp({ op: "sum" });
  }

  /** Fold the group's rows to the mean of this field. Valid only in a value
   *  (size/pos) slot. */
  mean(): FieldExpr<false> {
    return this._withOp({ op: "mean" });
  }

  /** Fold the group's rows to the row count (ignores the field's own values).
   *  Valid only in a value (size/pos) slot. */
  count(): FieldExpr<false> {
    return this._withOp({ op: "count" });
  }

  /** Fold the group's rows to the number of distinct values of this field.
   *  Valid only in a value (size/pos) slot. */
  distinct(): FieldExpr<false> {
    return this._withOp({ op: "distinct" });
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
 *  GoFish (`dropNulls`, the schema's classes). A fold skips it. NaN is a
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

/** The sum of the values of `values` that are not missing. Over no rows it
 *  is 0, the sum of nothing. Over rows whose values are all missing it is
 *  undefined, as in SQL: their sum is unknown, not 0. So the sum of a
 *  singleton is the singleton, missing or not, which is what lets a channel
 *  sum a value an aggregate op already folded (`.mean()` over no rows). */
export const sumOf = (values: readonly unknown[]): number | undefined => {
  const vs = present(values);
  return vs.length === 0 && values.length > 0
    ? undefined
    : vs.reduce((a, b) => a + b, 0);
};

/**
 * Evaluate a field expression (or bare string/function accessor) against a
 * group's rows: the per-row values, folded to a SINGLETON when the pipeline
 * carries an aggregate op. This is self-contained expression evaluation — it
 * knows nothing about the consuming channel, and the channel needs no
 * knowledge of the pipeline: whatever default aggregation the channel applies
 * afterwards (sum for a size slot, mean for a pos slot) is the identity on a
 * singleton.
 *
 * Also reports the quantity the pipeline itself determines, if any: `count` /
 * `distinct` yield counts — not the source field's units — so they report
 * the quantity "count", in the declared unit "count". Every other pipeline
 * reports none, leaving the quantity to the caller (`resolveColumn`): a
 * `sum` or `mean` keeps its source column's quantity and unit.
 *
 * `folded` says whether an aggregate op folded the rows. A `.sum()` adds the
 * rows, so it checks that `column` (the quantity of the column it reads,
 * when the caller knows it) can be summed (`checkSummable`, #1197).
 *
 * Domain ops (`sort`/`reverse`/`bin`) don't belong in a value slot and throw;
 * so does a second aggregate (the fold happens once).
 */
export function evalFieldValues<T>(
  accessor: string | ((r: T) => unknown) | FieldExprWire | FieldExpr,
  rows: T[],
  column?: Quantity
): { values: unknown[]; quantity?: Quantity; folded: boolean } {
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
  if (agg === undefined) return { values: rows.map(key), folded: false };
  switch (agg.op) {
    case "count":
      return { values: [rows.length], quantity: COUNT_QUANTITY, folded: true };
    case "distinct":
      return {
        values: [new Set(rows.map(key)).size],
        quantity: COUNT_QUANTITY,
        folded: true,
      };
    case "mean":
      // No values, no mean: the fold is the singleton of no value
      // (`meanOf`), which every channel's own aggregation keeps (a sum of
      // `[undefined]` is undefined), so the channel has no value either.
      return { values: [meanOf(rows.map(key))], folded: true };
    default: // "sum"
      checkSummable(column, "field(...).sum()");
      return { values: [sumOf(rows.map(key))], folded: true };
  }
}

/** What `.count()` and `.distinct()` report: counts, read from no column. */
const COUNT_QUANTITY: Quantity = { name: "count", unit: COUNT };

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
  const pre: FieldExprWire = {
    type: "field",
    name,
    ...(preOps.length ? { ops: preOps } : {}),
  };
  return { pre, post: rest };
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
 * add up (to 1), so the unit has `CanAdd`.
 */
export const shareQuantity = (
  base: Quantity | undefined,
  byName?: string
): Quantity => {
  const name = `${base?.name ?? "value"} share${byName ? ` by ${byName}` : ""}`;
  return { name, unit: { unit: name, CanAdd: {} } };
};

/**
 * The windowed normalize stage: given the collected per-entry Values already
 * evaluated with the PRE-normalize expression (see `splitAtNormalize`), compute
 * each entry's share `v_e / Σv_e` across the window — the operator's own split
 * entries. A non-positive total has no meaningful share, so every entry gets 0
 * and a console warning rather than a divide-by-zero/negative-share NaN. Shares
 * are tagged with `shareQuantity` — see its doc for why that's load-bearing.
 */
export function applyEntryNormalize(
  entryValues: MaybeValue<number>[],
  byName?: string
): MaybeValue<number>[] {
  const nums = entryValues.map(numericDatum);
  const total = sumBy(nums);
  const baseQuantity = entryValues
    .map(datumQuantity)
    .find((q) => q !== undefined);
  // The window's total adds the entries.
  checkSummable(baseQuantity, "field(...).normalize()");
  const quantity = shareQuantity(baseQuantity, byName);
  if (!(total > 0)) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(
        `field(...).normalize(): the entry total is ${total} (≤ 0), so ` +
          `every share is 0. Check that the size field/aggregate produces ` +
          `positive values.`
      );
    }
    return nums.map(() => ({ type: "datum", datum: 0, quantity }) as const);
  }
  return nums.map(
    (n) => ({ type: "datum", datum: n / total, quantity }) as const
  );
}
