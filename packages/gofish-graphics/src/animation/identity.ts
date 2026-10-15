/**
 * IDENTITY across states: which mark in one state IS which mark in the next,
 * so a transition can move it instead of fading one out and another in.
 *
 * PROTOTYPE (animation grammar proposal). The rule is the key join of
 * Animated Vega-Lite and D3:
 *
 *   A mark is matched by the ROWS it draws, compared by `key`.
 *
 * The default key is row identity: two marks are the same mark when they
 * draw the same row objects, wherever each state's layout put them and
 * whatever operators they sit under (a home is one dot in a scatterplot, in
 * a bin of a histogram and in a pile of a split). An explicit `key` (a field
 * name, or a function of a row) compares rows by that value instead, as JSON,
 * so two years of gapminder, which are different rows, match by country.
 *
 * A mark here is the outermost node that draws exactly the rows its leaves
 * draw: a dot, a bar, or a composite of a bar and its label (whose parts the
 * tween pairs by position, as the flow form does). Two marks of one state
 * with the same key is an error: the key does not say which is which.
 *
 * Marks that draw NO rows (a hand-built diagram, a threshold rule placed with
 * `datum(...)`) have nothing to join on, so they match by their `.name()`
 * path from the state's root, with the leaf's index among the leaves of the
 * same path telling unnamed parts apart. This is the one branch, and it is a
 * domain case, not a heuristic: there are no rows to key.
 *
 * Names the library generates for itself (`__spread#31`) are not names a
 * person wrote, so they are not part of a path.
 *
 * PROTOTYPE SHORTCUT: identities are read off the resolved tree, so chrome a
 * later pass adds (axes, legends) has none: it stays with its state.
 */
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";
import { rowsOf } from "./grouping";

/** What a transition compares rows by: a field name or a function of a row.
 *  Omitted, the row itself (object identity). */
export type Key = string | ((row: any) => unknown);

/** A RELATIONAL node draws between other nodes it only refers to (an arrow,
 *  a connector, a tween): its children are all refs. Its geometry is derived
 *  from its operands, so it has no identity of its own to interpolate. */
export const isRelational = (node: GoFishNode): boolean =>
  node.children.length > 0 &&
  node.children.every((child) => child instanceof GoFishRef);

const kidsOf = (node: GoFishNode): GoFishNode[] =>
  node.children.filter((c): c is GoFishNode => c instanceof GoFishNode);

/** A user-written name, or undefined. */
const userName = (node: GoFishNode): string | undefined => {
  const name = node._name;
  return typeof name === "string" && !name.startsWith("__") ? name : undefined;
};

/** Object identity for rows, as a string: a counter per row object. */
const rowIds = new WeakMap<object, number>();
let nextRowId = 0;
const rowIdentity = (row: unknown): string => {
  if (typeof row !== "object" || row === null) return JSON.stringify(row);
  let id = rowIds.get(row);
  if (id === undefined) rowIds.set(row, (id = nextRowId++));
  return `#${id}`;
};

/** The key of a bag of rows: its distinct values of `key`, sorted. */
function keyOfRows(rows: unknown[], key: Key | undefined): string {
  const values = rows.map((row) => {
    if (key === undefined) return rowIdentity(row);
    const v =
      typeof key === "function"
        ? key(row)
        : (row as Record<string, unknown> | null)?.[key];
    return JSON.stringify(v) ?? "undefined";
  });
  return [...new Set(values)].sort().join("|");
}

/** Whether two bags hold the same row objects. */
const sameRows = (a: unknown[], b: unknown[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((r) => set.has(r));
};

/**
 * The marks of one state by identity (see the header). `where` names the
 * construct for the duplicate-key error.
 */
export function markIdentities(
  root: GoFishNode,
  key: Key | undefined,
  where: string
): Map<string, GoFishNode> {
  const out = new Map<string, GoFishNode>();
  const ordinals = new Map<string, number>();
  const walk = (node: GoFishNode, names: string): void => {
    if (isRelational(node)) return;
    const name = node === root ? undefined : userName(node);
    const path =
      name === undefined ? names : names === "" ? name : `${names}/${name}`;
    const kids = kidsOf(node);
    if (kids.length > 0 || node === root) {
      for (const kid of kids) walk(kid, path);
      return;
    }
    const rows = rowsOf(node);
    if (rows.length === 0) {
      // No rows to key (see the header): the name path.
      const n = ordinals.get(path) ?? 0;
      ordinals.set(path, n + 1);
      out.set(`name:${path}#${n}`, node);
      return;
    }
    // The mark: the outermost node below the root that draws these rows.
    let mark = node;
    while (
      mark.parent instanceof GoFishNode &&
      mark.parent !== root &&
      sameRows(rowsOf(mark.parent), rows)
    ) {
      mark = mark.parent;
    }
    const id = `rows:${keyOfRows(rows, key)}`;
    const seen = out.get(id);
    if (seen === mark) return; // another leaf of the same composite mark
    if (seen !== undefined) {
      throw new Error(
        `[gofish] ${where}: two marks of one state have the same key ` +
          `(${id.slice(5)}${key === undefined ? ", the same rows" : ""}), so ` +
          `the key does not say which mark is which. ` +
          (key === undefined
            ? `Draw each row once, or give a key: { key: "id" }.`
            : `Give a key that is unique per mark.`)
      );
    }
    out.set(id, mark);
  };
  walk(root, "");
  return out;
}

/**
 * The runs of matched marks over `states`: each run is one mark, at most one
 * node per state, in state order; runs in first-seen order. `absent[k]`
 * lists nodes of state `k` that are not there to match (a mark of a scene
 * that has not been built in yet), each a mark or a leaf inside one.
 */
export function matchRuns(
  states: GoFishNode[],
  key: Key | undefined,
  where: string,
  absent: Set<GoFishNode>[] = []
): { k: number; node: GoFishNode }[][] {
  const runs = new Map<string, { k: number; node: GoFishNode }[]>();
  states.forEach((state, k) => {
    for (const [id, node] of markIdentities(state, key, where)) {
      const gone = absent[k];
      if (gone !== undefined && leavesOf(node).some((l) => gone.has(l))) {
        continue;
      }
      let run = runs.get(id);
      if (run === undefined) runs.set(id, (run = []));
      run.push({ k, node });
    }
  });
  return [...runs.values()];
}

const leavesOf = (node: GoFishNode): GoFishNode[] => {
  const kids = kidsOf(node);
  return kids.length === 0 ? [node] : kids.flatMap(leavesOf);
};

/** The name path of every named node under `root` (names only), and the
 *  relational nodes in tree order: what an arrow's operands are matched by.
 *  An arrow's operands are named nodes of a hand-built diagram. */
export function namedPaths(root: GoFishNode): {
  pathOf: Map<GoFishNode, string>;
  byPath: Map<string, GoFishNode>;
  relational: GoFishNode[];
} {
  const pathOf = new Map<GoFishNode, string>();
  const byPath = new Map<string, GoFishNode>();
  const relational: GoFishNode[] = [];
  const walk = (node: GoFishNode, path: string): void => {
    if (isRelational(node)) {
      relational.push(node);
      return;
    }
    const name = node === root ? undefined : userName(node);
    const here =
      name === undefined ? path : path === "" ? name : `${path}/${name}`;
    if (name !== undefined && !byPath.has(here)) {
      byPath.set(here, node);
      pathOf.set(node, here);
    }
    for (const kid of kidsOf(node)) walk(kid, here);
  };
  walk(root, "");
  return { pathOf, byPath, relational };
}
