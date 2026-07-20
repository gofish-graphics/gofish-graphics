/**
 * The Neo data pipeline: condition → filter → linearize → nest → marginalize.
 * Each stage is a pure function over `Confusion` records; `buildMatrix` (see
 * matrix.ts) runs them in this fixed order.
 */

import { dimension, isPathPrefix, parsePath } from "./paths";

/** One row of input data: which path(s) were the true label(s) vs. the predicted (observed) label(s), and how many records shared this combination. */
export interface Confusion {
  actual: string[];
  observed: string[];
  count: number;
}

/** A condition restricting the dataset to records where one side's dimension takes a given value. */
export interface Condition {
  qualifier: "actual" | "observed";
  label: string;
  is: string;
}

/**
 * Collects every dimension (first path segment) that appears anywhere in
 * `records`, across both `actual` and `observed`, in first-occurrence order.
 */
export function dimensions(records: Confusion[]): string[] {
  const seen: string[] = [];
  const has = new Set<string>();
  const scan = (paths: string[]) => {
    for (const p of paths) {
      const d = dimension(p);
      if (!has.has(d)) {
        has.add(d);
        seen.push(d);
      }
    }
  };
  for (const r of records) {
    scan(r.actual);
    scan(r.observed);
  }
  return seen;
}

/**
 * Ensures every record has exactly one path per dimension in `dims`, on
 * both sides: any side missing a dimension gets a synthetic `"<dim>:none"`
 * path appended for it.
 */
export function normalizeRecords(
  records: Confusion[],
  dims: string[]
): Confusion[] {
  const fill = (paths: string[]): string[] => {
    const present = new Set(paths.map(dimension));
    const missing = dims.filter((d) => !present.has(d)).map((d) => `${d}:none`);
    return [...paths, ...missing];
  };
  return records.map((r) => ({
    actual: fill(r.actual),
    observed: fill(r.observed),
    count: r.count,
  }));
}

/**
 * Restricts to records where `where.qualifier`'s side contains a path equal
 * to, or a segment-aware descendant of, `where.is`; then removes every path
 * whose dimension is `where.label` from that side (only the qualifier side
 * is touched). Records left with an empty `actual` or `observed` are
 * dropped.
 */
export function condition(records: Confusion[], where: Condition): Confusion[] {
  const out: Confusion[] = [];
  for (const r of records) {
    const side = r[where.qualifier];
    const matches = side.some(
      (p) => p === where.is || isPathPrefix(where.is, p)
    );
    if (!matches) continue;
    const strippedSide = side.filter((p) => dimension(p) !== where.label);
    const next: Confusion = {
      actual: where.qualifier === "actual" ? strippedSide : r.actual,
      observed: where.qualifier === "observed" ? strippedSide : r.observed,
      count: r.count,
    };
    if (next.actual.length === 0 || next.observed.length === 0) continue;
    out.push(next);
  }
  return out;
}

/**
 * Keeps records where, for EACH string in `filters`, some path in `actual`
 * OR `observed` equals it or segment-aware descends from it.
 *
 * Declared divergence from the reference implementation: Apple's
 * ml-hierarchical-confusion-matrix filter only inspected the `actual` side
 * (an apparent copy/paste bug) and used raw substring matching (so e.g.
 * `"stat"` would incorrectly match `"state:open"`). This is evidently not
 * the intended semantics, so we implement what filtering is clearly meant
 * to do: check both sides, with proper `:`-segment boundaries.
 */
export function filter(records: Confusion[], filters: string[]): Confusion[] {
  const matchesSide = (side: string[], s: string) =>
    side.some((p) => p === s || isPathPrefix(s, p));
  return records.filter((r) =>
    filters.every((s) => matchesSide(r.actual, s) || matchesSide(r.observed, s))
  );
}

// --- linearize -------------------------------------------------------------

interface LinNode {
  name: string;
  children: Map<string, LinNode>;
  order: string[];
}

function linMakeNode(name: string): LinNode {
  return { name, children: new Map(), order: [] };
}

function linMergeChain(root: LinNode, chain: string[]): void {
  let cur = root;
  for (const name of chain) {
    let child = cur.children.get(name);
    if (!child) {
      child = linMakeNode(name);
      cur.children.set(name, child);
      cur.order.push(name);
    }
    cur = child;
  }
}

function collectLeafNames(node: LinNode): string[] {
  if (node.order.length === 0) return [node.name];
  const out: string[] = [];
  for (const key of node.order) {
    out.push(...collectLeafNames(node.children.get(key)!));
  }
  return out;
}

/** Postorder-collapses any node with more than one child into a single synthetic `{leaf,names}` leaf. */
function linCollapse(node: LinNode): void {
  for (const key of node.order) {
    linCollapse(node.children.get(key)!);
  }
  if (node.order.length > 1) {
    const leafNames = node.order.flatMap((key) =>
      collectLeafNames(node.children.get(key)!)
    );
    const syntheticName = `{${leafNames.join(",")}}`;
    node.children = new Map();
    node.order = [syntheticName];
    node.children.set(syntheticName, linMakeNode(syntheticName));
  }
}

function linSerialize(node: LinNode): string {
  const names: string[] = [];
  let cur: LinNode = node;
  for (;;) {
    names.push(cur.name);
    if (cur.order.length === 0) break;
    cur = cur.children.get(cur.order[0]!)!;
  }
  return names.join(":");
}

/**
 * Linearizes one side's paths: parses every path (a path may itself encode
 * multiple chains via `[a,b]` syntax) into chains, trie-merges them, then
 * collapses any node with more than one child (only possible via bracket
 * syntax within one path, or two paths sharing a dimension) into a single
 * synthetic leaf named `{x,y,...}` (brace-joined names of that node's
 * descendant leaves). Returns one linear colon-joined path per surviving
 * top-level branch.
 */
export function linearize(paths: string[]): string[] {
  const superRoot = linMakeNode("");
  for (const path of paths) {
    for (const chain of parsePath(path)) {
      linMergeChain(superRoot, chain);
    }
  }
  for (const key of superRoot.order) {
    linCollapse(superRoot.children.get(key)!);
  }
  return superRoot.order.map((key) =>
    linSerialize(superRoot.children.get(key)!)
  );
}

/** Applies {@link linearize} to both sides of every record. */
export function linearizeRecords(records: Confusion[]): Confusion[] {
  return records.map((r) => ({
    actual: linearize(r.actual),
    observed: linearize(r.observed),
    count: r.count,
  }));
}

// --- nest --------------------------------------------------------------

/**
 * For each dimension `classes[i]` (i >= 1) in turn: finds the entry with
 * dimension `classes[0]` and the entry with dimension `classes[i]`; if the
 * latter exists, appends its whole path (dimension segment included) onto
 * the `classes[0]` entry with a `:` separator and removes the standalone
 * entry. Leaves other paths untouched. Pure — returns a new array.
 */
export function nestPaths(paths: string[], classes: string[]): string[] {
  let out = [...paths];
  const [primary, ...rest] = classes;
  if (primary === undefined) return out;
  for (const secondaryDim of rest) {
    const primaryIdx = out.findIndex((p) => dimension(p) === primary);
    const secondaryIdx = out.findIndex((p) => dimension(p) === secondaryDim);
    if (primaryIdx === -1 || secondaryIdx === -1) continue;
    const merged = `${out[primaryIdx]}:${out[secondaryIdx]}`;
    out = out.filter((_, i) => i !== secondaryIdx);
    const newPrimaryIdx =
      primaryIdx > secondaryIdx ? primaryIdx - 1 : primaryIdx;
    out[newPrimaryIdx] = merged;
  }
  return out;
}

/** Applies {@link nestPaths} to both sides of every record. */
export function nest(records: Confusion[], classes: string[]): Confusion[] {
  return records.map((r) => ({
    actual: nestPaths(r.actual, classes),
    observed: nestPaths(r.observed, classes),
    count: r.count,
  }));
}

// --- marginalize ---------------------------------------------------------

/** One reduced (actual-label, observed-label, summed-count) bucket, ready for tree/matrix construction. */
export interface Cell {
  actual: string;
  observed: string;
  count: number;
}

/**
 * Groups records by (actual path of dimension `keep`, observed path of
 * dimension `keep`) — using `"none"` when a side lacks that dimension
 * entirely — and sums counts per bucket, in first-occurrence order.
 */
export function marginalize(records: Confusion[], keep: string): Cell[] {
  const pick = (paths: string[]): string => {
    const found = paths.find((p) => dimension(p) === keep);
    return found ?? "none";
  };
  const order: string[] = [];
  const buckets = new Map<string, Cell>();
  for (const r of records) {
    const actual = pick(r.actual);
    const observed = pick(r.observed);
    const key = `${actual} ${observed}`;
    let cell = buckets.get(key);
    if (!cell) {
      cell = { actual, observed, count: 0 };
      buckets.set(key, cell);
      order.push(key);
    }
    cell.count += r.count;
  }
  return order.map((key) => buckets.get(key)!);
}
