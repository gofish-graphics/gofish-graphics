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
import { toPath } from "lodash";

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
 *  `by` option of group/spread/scatter so `by: "datum.lake"` works whenever
 *  the rows agree on `lake`, and falls through to `undefined` when they don't. */
export function projectPath(obj: unknown, path: string): unknown {
  const segments = toPath(path);
  const values = projectValues(obj, segments);
  return values.length === 1 ? values[0] : undefined;
}

/** The `by` selector accepted by the split operators (group/spread/scatter):
 *  a field-path string or a key function over the row. */
export type SplitBy = string | ((r: any) => unknown);

/** Build the grouping key-function for a single split. Exists so that path
 *  parsing happens once per split (closing over the parsed `segments`) rather
 *  than once per row, and so the `typeof by === "function"` dispatch is resolved
 *  once rather than re-checked for every row.
 *
 *  Projected keys are runtime strings/numbers (or `undefined` for ill-posed
 *  groups, where the bag disagrees on the field); the assertion bridges the
 *  honest `unknown` produced by projection + homogeneity collapse. */
export function splitKeyFn(by: SplitBy): (r: any) => string | number {
  if (typeof by === "function") return by as (r: any) => string | number;
  const segments = toPath(by);
  return (r: any) => {
    const values = projectValues(r, segments);
    return (values.length === 1 ? values[0] : undefined) as string | number;
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
