/**
 * IDENTITY across keyframes: which mark in one keyframe IS which mark in the
 * next, so a transition can move it instead of fading one out and another in.
 *
 * PROTOTYPE (animation grammar proposal). One rule for charts and hand-built
 * diagrams alike:
 *
 *   A node's identity is its PATH from the keyframe's root: the components of
 *   the nodes on the way down, where a node's component is its data key (the
 *   value of the field an operator split it by) or, when it has none, the
 *   name it was given with `.name(...)`. Nodes with neither add nothing.
 *   Leaves that share a path are told apart by their order in the tree.
 *
 * So a bar in `spread lake | stack species` and the same bar in `spread lake
 * | spread species` are both `Lake A/Bass`, whatever the two layouts do with
 * them; a diagram's `rect(...).name("A")` is `A` in every state it appears in;
 * and the circle and the label inside `layer([...]).name("A")` are `A#0` and
 * `A#1`. This is Figma Smart Animate's and Motion's `layoutId` rule (match by
 * name), with a chart's data key standing in for a name it never had to write.
 *
 * PROTOTYPE SHORTCUT: identities are read off the resolved tree, so chrome a
 * later pass adds (axes, legends) has none: it stays with its keyframe and
 * switches at the keyframe's band edge instead of moving.
 *
 * Names the library generates for itself (`__spread#31`) are not names a
 * person wrote, so they are not identities.
 *
 * LEAF MATCHING (the R2D3 segue, `matchRuns` below). An ordered path is too
 * strict for a chart: the same home is `id=5` in a scatterplot, `bin=0/id=5`
 * in a histogram of it and `side=below/id=5` in the split, so the paths never
 * agree although each mark draws the same one row. So a leaf's data-key
 * components are read as an ASSIGNMENT of fields (`{ bin: 0, id: 5 }`), its
 * names as a path, and two leaves in different keyframes are the same mark
 * when their name paths and ordinals agree and either
 *
 *   - their assignments are equal (in any order: `lake/species` and
 *     `species/lake` are one bar), or
 *   - each one's assignment HOLDS OF THE OTHER'S ROWS: every row the other
 *     leaf draws has the values this one was split by. `{ id: 5 }` holds of
 *     the histogram dot's row, and `{ bin: 0, id: 5 }` of the scatter dot's.
 *
 * The first is the path rule with the order dropped; it is what matches
 * gapminder's countries across years (different rows, one key). The second
 * is D3's key join read off the splits: a mark's key is the conjunction of
 * the fields it was split by. A leaf matches at most one leaf per keyframe;
 * an ambiguous candidate is no match (it fades).
 *
 * PROTOTYPE SHORTCUT: values are compared as strings (`node.key` is one), and
 * a split by a field EXPRESSION (`field("x").bin()`) records the field name
 * but keys by the bin, so its assignment does not hold of rows and such a
 * leaf matches only by equal assignments.
 */
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";
import { rowsOf } from "./grouping";

/** What one node adds to the path: its data key, else its own name. */
function componentOf(node: GoFishNode): string | undefined {
  if (node.key !== undefined && node.key !== null) return String(node.key);
  const name = node._name;
  if (typeof name === "string" && !name.startsWith("__")) return name;
  return undefined;
}

/** A RELATIONAL node draws between other nodes it only refers to (an arrow,
 *  a connector, a tween): its children are all refs. Its geometry is derived
 *  from its operands, so it has no identity of its own to interpolate. */
export const isRelational = (node: GoFishNode): boolean =>
  node.children.length > 0 &&
  node.children.every((child) => child instanceof GoFishRef);

export type Identities = {
  /** The leaves (nodes that draw and have no children), by identity. */
  leaves: Map<string, GoFishNode>;
  /** Every node that adds a component to the path, by its path. These are
   *  what a relational mark's operands are matched by. */
  named: Map<string, GoFishNode>;
  /** The relational nodes under the root, in tree order. */
  relational: GoFishNode[];
  /** The path of each node in `named`, the other way round. */
  pathOf: Map<GoFishNode, string>;
};

/** The identities of everything under `root` (see the header). */
export function identities(root: GoFishNode): Identities {
  const out: Identities = {
    leaves: new Map(),
    named: new Map(),
    relational: [],
    pathOf: new Map(),
  };
  const ordinals = new Map<string, number>();
  const walk = (node: GoFishNode, path: string): void => {
    if (isRelational(node)) {
      out.relational.push(node);
      return;
    }
    const component = node === root ? undefined : componentOf(node);
    const here =
      component === undefined
        ? path
        : path === ""
          ? component
          : `${path}/${component}`;
    if (component !== undefined && !out.named.has(here)) {
      out.named.set(here, node);
      out.pathOf.set(node, here);
    }
    const kids = node.children.filter(
      (c): c is GoFishNode => c instanceof GoFishNode
    );
    if (kids.length === 0 && node !== root) {
      const n = ordinals.get(here) ?? 0;
      ordinals.set(here, n + 1);
      const id = `${here}#${n}`;
      out.leaves.set(id, node);
      return;
    }
    for (const kid of kids) walk(kid, here);
  };
  walk(root, "");
  return out;
}

/* ---- Leaf matching across keyframes (see the header) ---- */

/** A leaf of one keyframe, read for matching. */
export type LeafKey = {
  node: GoFishNode;
  /** The name components on its path, in order. */
  names: string;
  /** The data-key components on its path, as field -> value. */
  keys: Map<string, string>;
  /** Its index among the keyframe's leaves with the same names and keys. */
  ordinal: number;
  rows: unknown[];
};

const canon = (keys: Map<string, string>): string =>
  [...keys]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([f, v]) => `${f}=${v}`)
    .join("&");

/** The field a data-key component was split by, when the split named one. */
const splitFieldOf = (node: GoFishNode): string | undefined =>
  node.key !== undefined && node.key !== null && node._syntheticKey !== true
    ? (node as unknown as { __splitBy?: string }).__splitBy
    : undefined;

/** The leaves of `root` with their name paths and key assignments. */
export function leafKeys(root: GoFishNode): LeafKey[] {
  const out: LeafKey[] = [];
  const ordinals = new Map<string, number>();
  const walk = (
    node: GoFishNode,
    names: string,
    keys: Map<string, string>
  ): void => {
    if (isRelational(node)) return;
    if (node !== root) {
      const field = splitFieldOf(node);
      if (field !== undefined) {
        keys = new Map(keys).set(field, String(node.key));
      } else {
        const c = componentOf(node);
        if (c !== undefined) names = names === "" ? c : `${names}/${c}`;
      }
    }
    const kids = node.children.filter(
      (c): c is GoFishNode => c instanceof GoFishNode
    );
    if (kids.length === 0 && node !== root) {
      const id = `${names}|${canon(keys)}`;
      const ordinal = ordinals.get(id) ?? 0;
      ordinals.set(id, ordinal + 1);
      out.push({ node, names, keys, ordinal, rows: rowsOf(node) });
      return;
    }
    for (const kid of kids) walk(kid, names, keys);
  };
  walk(root, "", new Map());
  return out;
}

const valueOf = (row: unknown, field: string): string | undefined =>
  typeof row === "object" && row !== null
    ? String((row as Record<string, unknown>)[field])
    : undefined;

/** `keys` holds of `rows`: every row has every value. */
function holds(keys: Map<string, string>, rows: unknown[]): boolean {
  if (keys.size === 0 || rows.length === 0) return false;
  return rows.every((r) => [...keys].every(([f, v]) => valueOf(r, f) === v));
}

/** The values `rows` agree on for `fields`, joined; undefined if they don't. */
function project(fields: string[], rows: unknown[]): string | undefined {
  if (rows.length === 0) return undefined;
  const values: string[] = [];
  for (const f of fields) {
    const vs = new Set(rows.map((r) => valueOf(r, f)));
    const [v] = [...vs];
    if (vs.size !== 1 || v === undefined) return undefined;
    values.push(v);
  }
  return values.join("&");
}

/** The pairs of leaves of `a` and `b` that are the same mark. */
function matchPair(a: LeafKey[], b: LeafKey[]): [number, number][] {
  // b's leaves by exact assignment; and by name path, then the fields of
  // their assignment, then its values.
  const exact = new Map<string, number>();
  const byFields = new Map<string, Map<string, Map<string, number[]>>>();
  b.forEach((m, j) => {
    exact.set(`${m.names}|${canon(m.keys)}#${m.ordinal}`, j);
    if (m.keys.size === 0) return;
    const fields = [...m.keys.keys()].sort();
    let perNames = byFields.get(m.names);
    if (perNames === undefined) byFields.set(m.names, (perNames = new Map()));
    const sig = fields.join("&");
    let perFields = perNames.get(sig);
    if (perFields === undefined) perNames.set(sig, (perFields = new Map()));
    const values = fields.map((f) => m.keys.get(f)!).join("&");
    let list = perFields.get(values);
    if (list === undefined) perFields.set(values, (list = []));
    list.push(j);
  });
  const pairs: [number, number][] = [];
  a.forEach((l, i) => {
    const same = exact.get(`${l.names}|${canon(l.keys)}#${l.ordinal}`);
    if (same !== undefined) {
      pairs.push([i, same]);
      return;
    }
    if (l.keys.size === 0) return;
    const found = new Set<number>();
    for (const [sig, perFields] of byFields.get(l.names) ?? []) {
      const values = project(sig.split("&"), l.rows);
      if (values === undefined) continue;
      for (const j of perFields.get(values) ?? []) {
        if (b[j].ordinal === l.ordinal && holds(l.keys, b[j].rows)) {
          found.add(j);
        }
      }
    }
    if (found.size === 1) pairs.push([i, [...found][0]]);
  });
  return pairs;
}

/**
 * The runs of matched leaves over `keyframes`: each run is one mark, at most
 * one leaf per keyframe, in keyframe order; runs in first-seen order. Every
 * pair of keyframes is matched (not only neighbors), so a mark absent from
 * the middle keyframe is still one mark at both ends.
 */
export function matchRuns(
  keyframes: GoFishNode[]
): { k: number; node: GoFishNode }[][] {
  const leaves = keyframes.map(leafKeys);
  const base: number[] = [];
  let total = 0;
  for (const ls of leaves) {
    base.push(total);
    total += ls.length;
  }
  const parent = Array.from({ length: total }, (_, n) => n);
  const frames = leaves.flatMap((ls, k) => ls.map(() => new Set([k])));
  const find = (n: number): number =>
    parent[n] === n ? n : (parent[n] = find(parent[n]));
  for (let p = 0; p < leaves.length; p++) {
    for (let q = p + 1; q < leaves.length; q++) {
      for (const [i, j] of matchPair(leaves[p], leaves[q])) {
        const [x, y] = [find(base[p] + i), find(base[q] + j)];
        if (x === y) continue;
        // One leaf per keyframe in a run: a union that would put two leaves
        // of one keyframe in one mark is ambiguous, so it is not made.
        if ([...frames[y]].some((k) => frames[x].has(k))) continue;
        parent[y] = x;
        frames[y].forEach((k) => frames[x].add(k));
      }
    }
  }
  const runs = new Map<number, { k: number; node: GoFishNode }[]>();
  leaves.forEach((ls, k) =>
    ls.forEach((leaf, i) => {
      const root = find(base[k] + i);
      let run = runs.get(root);
      if (run === undefined) runs.set(root, (run = []));
      run.push({ k, node: leaf.node });
    })
  );
  return [...runs.values()];
}
