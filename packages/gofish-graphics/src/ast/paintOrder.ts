// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { GoFishNode } from "./_node";
import type { GoFishAST } from "./_ast";
import { isToken } from "./createName";
import { isZOrderConstraint } from "./constraints/zorder";
import type { ZOrderConstraint } from "./constraints/zorder";

/**
 * Paint-order resolution: the order a node paints its DIRECT children in. The
 * one rule behind every bake walk (the root `bake`, `bakeChildren`, and the
 * coord-local `flattenLayout`), so z-order is honored identically inside and
 * outside a coordinate transform. Each walk recurses one node at a time, so a
 * node's order never reaches past its own children (#982).
 *
 * A `zAbove(a, b)` / `zBelow(a, b)` constraint declared at a layer L orders the
 * two direct children of L that contain `a` and `b`. When both lie in the same
 * child, the constraint is pushed down into that child's own sort, and so on,
 * until the two land in different children. Names are visible through plain
 * (non-component) nested layers only: a component or any other operator is
 * opaque, and a name that names a plain layer means that whole layer.
 */

/** A node's own `zAbove`/`zBelow` constraints. */
const zConstraintsOf = (node: GoFishAST): ZOrderConstraint[] =>
  ((node instanceof GoFishNode ? node.constraints : undefined) ?? []).filter(
    isZOrderConstraint
  );

/** Whether names inside `node` are visible to its ancestors' z constraints: a
 *  plain (non-component) layer is transparent; anything else is opaque. */
const namesVisibleThrough = (node: GoFishAST): node is GoFishNode =>
  node instanceof GoFishNode && !node._isComponent && node.type === "layer";

/** The resolved string name of a node (`.name("…")`), or undefined for an
 *  unnamed node / a `GoFishRef`. */
const nodeName = (node: GoFishAST): string | undefined => {
  if (!(node instanceof GoFishNode) || node._name === undefined) {
    return undefined;
  }
  return isToken(node._name) ? node._name.__tag : node._name;
};

/**
 * The z constraints that order `node`'s children: its own, plus those of each
 * ancestor reached through plain layers. An ancestor's constraint whose two
 * operands both lie inside `node` was pushed down to `node` (they landed in the
 * same child at every level in between); one whose operands do not both lie
 * inside `node` resolves to nothing here, because its names are looked up only
 * among `node`'s descendants.
 */
const applicableConstraints = (node: GoFishAST): ZOrderConstraint[] => {
  const out = [...zConstraintsOf(node)];
  let cur: GoFishAST = node;
  while (namesVisibleThrough(cur) && cur.parent !== undefined) {
    cur = cur.parent;
    out.push(...zConstraintsOf(cur));
  }
  return out;
};

/** name → the indices of the children whose subtree (seen through plain
 *  layers) carries that name. */
const childIndicesByName = (
  children: GoFishAST[]
): Map<string, Set<number>> => {
  const index = new Map<string, Set<number>>();
  const visit = (node: GoFishAST, i: number) => {
    const name = nodeName(node);
    if (name !== undefined) {
      let set = index.get(name);
      if (set === undefined) index.set(name, (set = new Set()));
      set.add(i);
    }
    if (namesVisibleThrough(node)) {
      for (const child of node.children) visit(child, i);
    }
  };
  children.forEach((child, i) => visit(child, i));
  return index;
};

const zOf = (child: GoFishAST): number =>
  child instanceof GoFishNode ? (child.getZOrder() ?? 0) : 0;

const describe = (c: ZOrderConstraint): string =>
  `${c.type}(${c.children[0].name}, ${c.children[1].name})`;

/**
 * Resolve the draw order of a node's direct children.
 *
 * Unconstrained children paint in `(zOrder, index)` order; numeric `.zOrder(n)`
 * compares only among siblings. The z constraints that apply here (see
 * {@link applicableConstraints}) add edges between children, and the children
 * are then sorted topologically, always emitting the smallest ready child by
 * `(zOrder, index)`. Throws, naming the constraints, if those edges form a
 * cycle.
 */
export function orderChildrenForPaint(node: GoFishAST): GoFishAST[] {
  if (!("children" in node) || !node.children) return [];
  const children: GoFishAST[] = node.children;
  const n = children.length;

  // Edges between children, each with the constraints that produced it.
  // Adjacency is allocated lazily: a layer can hold tens of thousands of
  // children while only a handful carry constraints (72 line connectors over
  // 26,280 point anchors in the bird-migration chart).
  const constraints = n > 1 ? applicableConstraints(node) : [];
  const adj: (Map<number, ZOrderConstraint[]> | undefined)[] = new Array(n);
  const inDegree = new Array<number>(n).fill(0);
  let edges = 0;
  if (constraints.length > 0) {
    const byName = childIndicesByName(children);
    const addEdge = (from: number, to: number, c: ZOrderConstraint) => {
      // Same child: the constraint is pushed down into that child's own sort.
      if (from === to) return;
      let out = adj[from];
      if (out === undefined) adj[from] = out = new Map();
      const via = out.get(to);
      if (via !== undefined) {
        if (!via.includes(c)) via.push(c);
        return;
      }
      out.set(to, [c]);
      inDegree[to]++;
      edges++;
    };
    for (const c of constraints) {
      const as = byName.get(c.children[0].name);
      const bs = byName.get(c.children[1].name);
      if (as === undefined || bs === undefined) continue;
      for (const a of as) {
        for (const b of bs) {
          // zAbove(a, b): a paints LATER (over b) → edge b → a.
          // zBelow(a, b): a paints EARLIER (under b) → edge a → b.
          if (c.type === "zAbove") addEdge(b, a, c);
          else addEdge(a, b, c);
        }
      }
    }
  }

  // No edges: a plain `(zOrder, index)` sort. With every z-order at the
  // default 0 that is just index order, so skip the sort.
  if (edges === 0) {
    return children.some((child) => zOf(child) !== 0)
      ? children
          .map((child, index) => ({ child, index }))
          .sort((a, b) => zOf(a.child) - zOf(b.child) || a.index - b.index)
          .map(({ child }) => child)
      : children;
  }

  // Kahn's algorithm, always emitting the SMALLEST ready child by
  // `(zOrder, index)`. The ready set is a binary min-heap rather than a
  // re-sorted array: the choice, and so the order, is identical, but a re-sort
  // plus `shift()` per emission is quadratic in the number of children.
  const zKey = children.map(zOf);
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
  const emitted = new Array<boolean>(n).fill(false);
  while (heap.length > 0) {
    const i = heapPop();
    result.push(children[i]);
    emitted[i] = true;
    const out = adj[i];
    if (out === undefined) continue;
    for (const j of out.keys()) {
      if (--inDegree[j] === 0) heapPush(j);
    }
  }

  if (result.length < n) {
    // Every constraint behind an edge between two children left unordered.
    const involved = new Set<ZOrderConstraint>();
    for (let i = 0; i < n; i++) {
      if (emitted[i]) continue;
      for (const [j, via] of adj[i] ?? []) {
        if (!emitted[j]) via.forEach((c) => involved.add(c));
      }
    }
    throw new Error(
      `z-order constraints form a cycle among the children of ` +
        `${nodeName(node) ?? "a layer"}: ` +
        `${[...involved].map(describe).join(", ")}. ` +
        `A layer paints each child as a whole, so one child cannot paint ` +
        `both under and over parts of another.`
    );
  }
  return result;
}
