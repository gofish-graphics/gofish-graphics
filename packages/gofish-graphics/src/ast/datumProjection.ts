// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// Datum-path projection: field access that lifts over a node's row collection.
//
// A selected node's `datum` is the *bag of rows* that flowed into it (the
// operator pipeline binds it as an array; a fully-split leaf is a 1-row bag).
// Reading a field off that bag is a relational projection π_field — the
// multiset of that field's values across the rows.
//
// `projectPath` collapses on homogeneity: it resolves to the common value iff
// every row agrees on it (this covers both the 1-row case and a many-row bag
// that happens to be constant in the field, e.g. all of one lake's species
// rows share `lake`), and to `undefined` when the rows disagree — the honest
// "this field is multi-valued here, grouping by it is ill-posed" signal. This
// is exactly SQL's functional-dependency rule (`ONLY_FULL_GROUP_BY`): a column
// is selectable bare iff it is single-valued within the group.
//
// `pluck` is the un-collapsed sibling — the full set of distinct values — for
// when you genuinely want "every possible value" rather than a scalar key.
import toPath from "lodash/toPath";
import { bin as d3bin } from "d3-array";
import sumBy from "lodash/sumBy";
import { GoFishRef } from "./_ref";
import { isField, type FieldAccessor } from "./data";
import { getFieldOps, type FieldOp } from "./fieldExpr";

/** Canonical key for value-equality of (possibly object-valued) field values. */
function eqKey(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

/** Distinct values produced by walking `segments` from `obj`, projecting over
 *  any array encountered (mapping the remaining walk across its elements).
 *  Returns the de-duplicated values in first-seen order. */
function projectValues(obj: unknown, segments: string[]): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    const k = eqKey(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  };

  const walk = (current: unknown, i: number): void => {
    if (current == null) return; // a missing hop contributes no value
    if (current instanceof GoFishRef) {
      // A ref stands in for the bag of rows it points at: descend into its
      // `.datum` at the SAME segment, so `by: "lake"` projects through a
      // `selectAll(...)` ref exactly as a bare row would — no `datum.` prefix.
      walk(current.datum, i);
      return;
    }
    if (Array.isArray(current)) {
      // Project the rest of the walk over every element of the bag.
      for (const el of current) walk(el, i);
      return;
    }
    if (i === segments.length) {
      push(current);
      return;
    }
    walk((current as Record<string, unknown>)[segments[i]], i + 1);
  };

  walk(obj, 0);
  return out;
}

/** Resolve `path` against `obj` with projection + homogeneity collapse.
 *  Scalar iff the projection is single-valued, else `undefined`. Used by the
 *  `by` option of group/spread/scatter so `by: "lake"` works whenever the rows
 *  agree on `lake`, and falls through to `undefined` when they don't. A
 *  `selectAll(...)` ref descends into its `.datum` bag automatically, so the
 *  same bare field path works on refs (no `datum.` prefix). */
export function projectPath(obj: unknown, path: string): unknown {
  const segments = toPath(path);
  const values = projectValues(obj, segments);
  return values.length === 1 ? values[0] : undefined;
}

/** The `by` selector accepted by the split operators (group/spread/scatter):
 *  a field-path string, a key function over the row, or a `field(...)`
 *  accessor (possibly carrying a pipeline of domain ops — see
 *  {@link splitEntries}). */
export type SplitBy = string | ((r: any) => unknown) | FieldAccessor;

/**
 * The mutable cell `ChartBuilder` writes the computed default split/travel
 * direction into (issue #752's default-grouping rule — see
 * `notes/design/relational-mark-default-split.md`). `resolved` marks that a
 * default computation already ran for this connector, so the `.mark()`
 * fusion rewrite's internal `.layer(...)` call (which re-enters
 * `ChartBuilder.layer()`) doesn't recompute and overwrite it.
 *
 * Canonical home for both `chart.ts` (which tags every relational mark with
 * an `inferred` cell of this shape) and `chartBuilder.ts` (which computes
 * into it) — a type-only import creates no runtime cycle even though
 * `chart.ts` also imports `ChartBuilder` from `chartBuilder.ts` at runtime.
 */
export type InferredRelational = {
  by?: SplitBy;
  dir?: "x" | "y";
  resolved?: boolean;
};

/** Build the grouping key-function for a single split. Exists so that path
 *  parsing happens once per split (closing over the parsed `segments`) rather
 *  than once per row, and so the `typeof by === "function"` dispatch is resolved
 *  once rather than re-checked for every row.
 *
 *  A `field(...)` accessor grouping-keys off its `.name`, identical to
 *  passing the bare field-name string — its pipeline ops (if any) are applied
 *  separately, over the grouped Map, by {@link splitEntries}.
 *
 *  Projected keys are runtime strings/numbers (or `undefined` for ill-posed
 *  groups, where the bag disagrees on the field); the assertion bridges the
 *  honest `unknown` produced by projection + homogeneity collapse. */
export function splitKeyFn(by: SplitBy): (r: any) => string | number {
  if (typeof by === "function") return by as (r: any) => string | number;
  const path = isField(by) ? by.name : by;
  const segments = toPath(path);
  return (r: any) => {
    const values = projectValues(r, segments);
    return (values.length === 1 ? values[0] : undefined) as string | number;
  };
}

/** Numeric-aware, lodash-`orderBy`-compatible-enough key comparator: compares
 *  as numbers when both keys coerce to finite numbers, else falls back to
 *  string comparison. Used by `field(...).sort()`'s no-arg (sort-by-key) form. */
function compareKeys(a: string | number, b: string | number): number {
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

/** Bin `d` by the numeric field `fieldName`, mirroring `runBin` in
 *  transforms.ts (d3-array, default 10 thresholds). REPLACES the base
 *  grouping — entries are keyed by each bin's start (ascending). Empty bins
 *  are dropped to match `Map.groupBy` semantics (a group with zero rows isn't
 *  represented as a key there either). */
function binEntries<T extends Record<string, any>>(
  fieldName: string,
  d: T[],
  thresholds: number | number[] | undefined
): Map<number, T[]> {
  const th = thresholds ?? 10;
  const binnerBase = d3bin<T, number>().value(
    (row) => row[fieldName] as number
  );
  const binner = Array.isArray(th)
    ? binnerBase.thresholds(th as number[])
    : binnerBase.thresholds(th as number);
  const bins = binner(d.filter((row) => row[fieldName] != null));
  const entries = new Map<number, T[]>();
  for (const b of bins) {
    if (b.x0 === undefined || b.length === 0) continue; // drop empty bins
    entries.set(b.x0, [...b]);
  }
  return entries;
}

/** Reorder `entries`: with `values` (#735), by that explicit group-key
 *  order — groups not listed are appended after, in natural sort order; with
 *  `by`, by the SUM of that field over each entry's rows; with neither, by
 *  the entry's own group key (numeric-aware). */
function sortEntries<T>(
  entries: Map<string | number, T[]>,
  op: Extract<FieldOp, { op: "sort" }>
): Map<string | number, T[]> {
  const pairs = [...entries.entries()];
  if (op.values !== undefined) {
    const rank = new Map(op.values.map((v, i) => [v, i]));
    pairs.sort(([ka], [kb]) => {
      const ra = rank.get(ka);
      const rb = rank.get(kb);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return compareKeys(ka, kb);
    });
    return new Map(pairs);
  }
  const dir = op.order === "desc" ? -1 : 1;
  if (op.by !== undefined) {
    const by = op.by;
    pairs.sort(([, a], [, b]) => dir * (sumBy(a, by) - sumBy(b, by)));
  } else {
    pairs.sort(([ka], [kb]) => dir * compareKeys(ka, kb));
  }
  return new Map(pairs);
}

/**
 * Group `d` by `by` (via {@link splitKeyFn}), then apply any pipeline ops
 * carried by a `field(...)` accessor (read via `getFieldOps`) IN ORDER:
 *   - `dropNulls` filters out rows whose value at `by`'s field is
 *     `null`/`undefined`, BEFORE grouping — since grouping always happens
 *     first (`bin` re-derives its own grouping from the same filtered rows),
 *     this is equivalent regardless of where `dropNulls` sits in the chain.
 *   - `bin` REPLACES the base grouping (re-groups the raw `d` into bins).
 *   - `sort` / `reverse` reorder the entries Map.
 *   - a value-slot op (`sum`/`mean`/`count`/`distinct`) in a `by` slot, or
 *     `normalize`, throws — those aren't domain ops.
 * Central helper so spread/group/scatter share one split+ops pipeline —
 * `by`-string/function callers get plain `Map.groupBy` behavior unchanged
 * (they carry no ops).
 */
export function splitEntries<T extends Record<string, any>>(
  by: SplitBy,
  d: T[]
): Map<string | number, T[]> {
  const ops: FieldOp[] = getFieldOps(by);
  let rows = d;
  if (ops.some((op) => op.op === "dropNulls")) {
    if (!isField(by)) {
      throw new Error(
        "field(...).dropNulls() requires a field(name) accessor as `by`, not a function."
      );
    }
    const name = by.name;
    rows = d.filter((row) => {
      const v = (row as Record<string, unknown>)[name];
      return v !== null && v !== undefined;
    });
  }
  let entries: Map<string | number, T[]> = Map.groupBy(rows, splitKeyFn(by));
  for (const op of ops) {
    switch (op.op) {
      case "dropNulls":
        break; // filtered above, before grouping
      case "bin": {
        if (!isField(by)) {
          throw new Error(
            "field(...).bin() requires a field(name) accessor as `by`, not a function."
          );
        }
        entries = binEntries(by.name, rows, op.thresholds);
        break;
      }
      case "sort":
        entries = sortEntries(entries, op);
        break;
      case "reverse":
        entries = new Map([...entries.entries()].reverse());
        break;
      case "sum":
      case "mean":
      case "count":
      case "distinct":
        throw new Error(
          `field(...).${op.op}() is an aggregate op — valid on a value channel ` +
            `(e.g. rect({ h: field(...).${op.op}() })), not on \`by\`.`
        );
      case "normalize":
        throw new Error(
          "field(...).normalize() is only supported on an operator's size channel"
        );
    }
  }
  return entries;
}

/** Which axes a scatter-family opts object positions: `x`/`y` true when a
 *  plain point value or a full range (`Min`+`Max`) is given for that axis.
 *  Shared by `Scatter`'s own `hasX`/`hasY` guard (`graphicalOperators/
 *  scatter.tsx`) and `chartBuilder.ts`'s `classifyOperator` (which reads the
 *  SAME opts shape off a scatter operator's `__serialize.opts` to classify
 *  it for the relational-mark default-split rule — issue #752) so the two
 *  don't drift. Lives in this leaf module (no dependency on either caller)
 *  rather than being exported from `scatter.tsx`: that module imports
 *  `createOperator.ts`, which imports back from `chartBuilder.ts` — a
 *  `chartBuilder.ts -> scatter.tsx` runtime import would cycle. */
export function scatterPositions(opts: {
  x?: unknown;
  xMin?: unknown;
  xMax?: unknown;
  y?: unknown;
  yMin?: unknown;
  yMax?: unknown;
}): { x: boolean; y: boolean } {
  return {
    x:
      opts.x !== undefined ||
      (opts.xMin !== undefined && opts.xMax !== undefined),
    y:
      opts.y !== undefined ||
      (opts.yMin !== undefined && opts.yMax !== undefined),
  };
}

/** The full set of distinct values at `path` ("every possible value"), with no
 *  collapse. `source` may be a ref (anything exposing `.datum`), a row array,
 *  or a single row. Use when you want the multiset, not a scalar key. */
export function pluck(source: any, path: string): unknown[] {
  const root =
    source != null && typeof source === "object" && "datum" in source
      ? (source as { datum: unknown }).datum
      : source;
  return projectValues(root, toPath(path));
}
