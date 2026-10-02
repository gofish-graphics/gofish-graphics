// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { GoFishNode } from "./_node";
import type { GoFishAST } from "./_ast";
import { visibleNodes } from "./_ref";
import { childNameKey } from "./constraints/shared";
import { isZOrderConstraint } from "./constraints/zorder";
import type { ZOrderConstraint } from "./constraints/zorder";

/**
 * Paint-order resolution: the order a node paints its DIRECT children in. The
 * one rule behind every place that paints a node's children: the bake walks
 * (the root `bake`, `bakeChildren`, and the coord-local `flattenLayout`) and
 * the bake boundaries that lower their own children (`coord`, and `enclose`,
 * `offset` and `arrow` through `lowerChildrenOffset`), so z-order is honored
 * identically inside and outside a boundary. Each of them recurses one node at
 * a time, so a node's order never reaches past its own children (#982).
 *
 * The compositors (`over`, `atop`, `in`, `out`, `xor`, `mask`) are the
 * exception the operator itself defines: they paint ONE result combined from a
 * source child and a destination child, so their children have no paint order
 * to change. They call {@link assertNoPaintOrder} instead, which throws if a z
 * constraint tries to order them.
 *
 * A `zAbove(a, b)` / `zBelow(a, b)` constraint declared at a layer L is
 * resolved once, when L orders its children. Its operand names are looked up
 * with the shared name rule (`visibleNodes`: through any non-component node,
 * never into a `createMark` component), and every node carrying the name is an
 * operand. For each pair of operand nodes, the constraint orders the two
 * children of the node where their paths from L part: a child of L when they
 * lie in different children, else a node further down (pushed down).
 */

/** `from` paints before `to`, because of `constraint`. */
type Edge = { from: GoFishAST; to: GoFishAST; constraint: ZOrderConstraint };

/** The edges each node's children receive, keyed by the layer that declared
 *  them, so a layer's re-resolution replaces its own earlier edges. */
const edgesAt = new WeakMap<GoFishAST, Map<GoFishNode, Edge[]>>();
/** The nodes a layer last wrote edges to (cleared on re-resolution). */
const partedAt = new WeakMap<GoFishNode, GoFishAST[]>();

/** The path from `root` (exclusive) down to `node` (inclusive), for a `node`
 *  inside `root`. */
const pathFrom = (root: GoFishNode, node: GoFishAST): GoFishAST[] => {
  const path: GoFishAST[] = [];
  for (let cur = node; cur !== root; cur = cur.parent!) path.push(cur);
  return path.reverse();
};

/**
 * Resolve `layer`'s z constraints into edges between the children of the
 * nodes where their operands part. Each operand set is grouped by the child of
 * the current node that holds it: distinct children get an edge, and a child
 * holding both sides is entered to split them further. A node that is itself
 * an operand ends its path there (it cannot be ordered against its own
 * descendants).
 */
function resolveZConstraints(layer: GoFishNode): void {
  for (const parted of partedAt.get(layer) ?? []) {
    edgesAt.get(parted)?.delete(layer);
  }
  const constraints = (layer.constraints ?? []).filter(isZOrderConstraint);
  if (constraints.length === 0) {
    partedAt.delete(layer);
    return;
  }

  const byName = new Map<string, GoFishAST[][]>();
  for (const n of visibleNodes(layer)) {
    const name = n === layer ? undefined : childNameKey(n);
    if (name === undefined) continue;
    let paths = byName.get(name);
    if (paths === undefined) byName.set(name, (paths = []));
    paths.push(pathFrom(layer, n));
  }

  const written: GoFishAST[] = [];
  const addEdge = (at: GoFishAST, edge: Edge) => {
    let byLayer = edgesAt.get(at);
    if (byLayer === undefined) edgesAt.set(at, (byLayer = new Map()));
    let edges = byLayer.get(layer);
    if (edges === undefined) {
      byLayer.set(layer, (edges = []));
      written.push(at);
    }
    edges.push(edge);
  };
  const groupAt = (paths: GoFishAST[][], depth: number) => {
    const groups = new Map<GoFishAST, GoFishAST[][]>();
    for (const p of paths) {
      if (p.length <= depth) continue;
      let g = groups.get(p[depth]);
      if (g === undefined) groups.set(p[depth], (g = []));
      g.push(p);
    }
    return groups;
  };
  const split = (
    at: GoFishAST,
    depth: number,
    as: GoFishAST[][],
    bs: GoFishAST[][],
    c: ZOrderConstraint
  ) => {
    const ga = groupAt(as, depth);
    const gb = groupAt(bs, depth);
    for (const ca of ga.keys()) {
      for (const cb of gb.keys()) {
        if (ca === cb) continue;
        // zAbove(a, b): a paints over b, so b's child comes first.
        addEdge(
          at,
          c.type === "zAbove"
            ? { from: cb, to: ca, constraint: c }
            : { from: ca, to: cb, constraint: c }
        );
      }
    }
    for (const [child, sub] of ga) {
      const other = gb.get(child);
      if (other !== undefined) split(child, depth + 1, sub, other, c);
    }
  };

  for (const c of constraints) {
    const as = byName.get(c.children[0].name);
    const bs = byName.get(c.children[1].name);
    if (as !== undefined && bs !== undefined) split(layer, 0, as, bs, c);
  }
  partedAt.set(layer, written);
}

/** The edges that order `node`'s children, after resolving `node`'s own z
 *  constraints (every caller orders a node before descending into it). */
const edgesFor = (node: GoFishNode): Edge[] => {
  resolveZConstraints(node);
  return [...(edgesAt.get(node)?.values() ?? [])].flat();
};

const zOf = (child: GoFishAST): number =>
  child instanceof GoFishNode ? (child.getZOrder() ?? 0) : 0;

const describe = (c: ZOrderConstraint): string =>
  `${c.type}(${c.children[0].name}, ${c.children[1].name})`;

/**
 * Resolve the draw order of a node's direct children.
 *
 * Children paint in `(zOrder, index)` order; numeric `.zOrder(n)` compares
 * only among siblings. The z constraints that part at this node (see
 * {@link resolveZConstraints}) add edges between children, and the children
 * are sorted topologically, always emitting the smallest ready child by
 * `(zOrder, index)`. Throws, naming the constraints, if those edges form a
 * cycle.
 *
 * A node's own z constraints are resolved here, before any of its
 * descendants is ordered: every bake walk orders a node before descending.
 */
export function orderChildrenForPaint(node: GoFishAST): GoFishAST[] {
  if (!(node instanceof GoFishNode) || !node.children) return [];
  const edges = edgesFor(node);
  const children: GoFishAST[] = node.children;
  const n = children.length;
  if (n < 2) return children;

  const zKey = children.map(zOf);
  if (edges.length === 0 && zKey.every((z) => z === 0)) return children;

  const index = new Map(children.map((child, i) => [child, i]));
  const adj: (Set<number> | undefined)[] = new Array(n);
  const inDegree = new Array<number>(n).fill(0);
  for (const { from, to } of edges) {
    const i = index.get(from)!;
    const j = index.get(to)!;
    const out = (adj[i] ??= new Set());
    if (!out.has(j)) {
      out.add(j);
      inDegree[j]++;
    }
  }

  // Kahn's algorithm with a binary min-heap as the ready set (a re-sorted
  // array would be quadratic in the number of children).
  const less = (i: number, j: number): boolean =>
    zKey[i] !== zKey[j] ? zKey[i] < zKey[j] : i < j;
  const heap: number[] = [];
  const heapPush = (v: number) => {
    let i = heap.length;
    heap.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const heapPop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  for (let i = 0; i < n; i++) if (inDegree[i] === 0) heapPush(i);
  const result: GoFishAST[] = [];
  while (heap.length > 0) {
    const i = heapPop();
    result.push(children[i]);
    for (const j of adj[i] ?? []) {
      if (--inDegree[j] === 0) heapPush(j);
    }
  }

  if (result.length < n) {
    // A child left with a positive in-degree was never emitted.
    const stuck = (child: GoFishAST) => inDegree[index.get(child)!] > 0;
    const involved = new Set(
      edges
        .filter(({ from, to }) => stuck(from) && stuck(to))
        .map(({ constraint }) => describe(constraint))
    );
    throw new Error(
      `z-order constraints form a cycle among the children of ` +
        `${childNameKey(node) ?? "a layer"}: ${[...involved].join(", ")}. ` +
        `A layer paints each child as a whole, so one child cannot paint ` +
        `both under and over parts of another.`
    );
  }
  return result;
}

/**
 * For a node that paints one result combined from its children (a compositor:
 * `over`, `atop`, `in`, `out`, `xor`, `mask`), where each child's index names
 * its role rather than its paint order. Resolves the node's own z constraints
 * like {@link orderChildrenForPaint}, then throws if any z constraint orders
 * the node's children: there is no paint order between them to change.
 */
export function assertNoPaintOrder(node: GoFishNode): void {
  const edges = edgesFor(node);
  if (edges.length === 0) return;
  const named = new Set(edges.map(({ constraint }) => describe(constraint)));
  throw new Error(
    `z-order constraints ${[...named].join(", ")} order the children of ` +
      `${childNameKey(node) ?? `a "${node.type}" node`}, which composites ` +
      `them into one result rather than painting them in turn. Its children ` +
      `are its operands (source first, destination second), so they have no ` +
      `paint order to change. Order the composited node as a whole instead.`
  );
}
