// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { GoFishNode } from "./_node";
import type { GoFishAST } from "./_ast";
import { isToken } from "./createName";
import { isZOrderConstraint } from "./constraints/zorder";
import type { ZOrderConstraint } from "./constraints/zorder";

/**
 * Paint-order resolution: flatten a layer's subtree into a paint list, then
 * order it against the `zAbove`/`zBelow` semantics. The one rule behind both
 * `bake` walks — the root walk and the coord-local `flattenLayout` — so z-order
 * is honored identically inside and outside a coordinate transform.
 */

/**
 * A single paint unit in a layer's z-order resolution. Components stay whole
 * (one PaintItem); only plain non-component nested layers are flattened through
 * — so a mark/component is ordered as a unit.
 */
type PaintItem<P = undefined> = {
  node: GoFishAST;
  /** Sum of skipped-ancestor translates between this layer and the hoisted
   *  element. */
  accTranslate: [number, number];
  /** Position in the flattened default order (stable tiebreaker). */
  defaultOrder: number;
  /** Existing numeric `_zOrder` hint (primary tiebreaker so `node.zOrder(-1)`
   *  still pushes a node toward the back by default). */
  defaultZ: number;
  /** Caller payload folded down through each hoisted-through plain layer (see
   *  {@link flattenForZOrder}'s `fold` argument). `undefined` for callers that
   *  pass no fold; the root `bake` threads the flip scope through here so a
   *  hoisted unit lowers under the same scope it would without the constraint. */
  payload: P;
};

/** Whether the z-order flatten hoists through `node`: a plain (non-component)
 *  layer is transparent, and its children are the paint units. */
const hoistsForZOrder = (node: GoFishNode): boolean =>
  !node._isComponent && node.type === "layer";

/**
 * The paint units `node` is drawn as when a z-order constraint orders it: the
 * node itself, or, for a plain layer the flatten hoists through, the units of
 * its children. A constraint names units, so a constraint meant for `node`
 * names these.
 */
export function paintUnitsOf(node: GoFishAST): GoFishAST[] {
  if (!(node instanceof GoFishNode) || !hoistsForZOrder(node)) return [node];
  return node.children.flatMap(paintUnitsOf);
}

/**
 * Flatten a layer's children into a paint list at COMPONENT granularity: plain
 * (non-component) nested `layer`s are transparent and hoist their children into
 * this paint context (accumulating translate), while components and leaves stay
 * as single units.
 *
 * A caller may thread a `fold` payload down through each hoisted-through plain
 * layer (seeded once, re-derived at each hoist via `fold.onHoist`), surfaced on
 * each `PaintItem.payload`. The root `bake` uses it to carry the flip scope
 * through hoisted layers so a z-order constraint can never change a subtree's
 * orientation (#629).
 */
function flattenForZOrder<P = undefined>(
  children: GoFishAST[],
  fold?: {
    /** The payload active at the top level (the parent's own payload). */
    seed: P;
    /** Re-derive the payload for a hoisted-through plain layer's children, given
     *  the payload active above it and the accumulated translate to it. */
    onHoist: (payload: P, layer: GoFishNode, accTx: number, accTy: number) => P;
  }
): PaintItem<P>[] {
  const out: PaintItem<P>[] = [];
  let order = 0;
  walk(children, 0, 0, fold?.seed as P);
  return out;

  // NB: only translates are accumulated across transparent ancestors. A
  // non-component nested layer that also carries `options.transform.scale`
  // would hoist its children with the right translate but the *wrong* resolved
  // size, since the scale isn't propagated here. No current story mixes z-order
  // constraints with scaled inner layers; revisit if one does.
  function walk(
    cs: GoFishAST[],
    accTx: number,
    accTy: number,
    payload: P
  ): void {
    for (const child of cs) {
      if (!(child instanceof GoFishNode)) {
        out.push({
          node: child,
          accTranslate: [accTx, accTy],
          defaultOrder: order++,
          defaultZ: 0,
          payload,
        });
        continue;
      }
      // Plain (non-component) nested layers are transparent for paint ordering —
      // their children are hoisted into this paint context.
      if (hoistsForZOrder(child)) {
        // Read the LEDGER projection, not raw `transform.translate` (#39 stage
        // 3): a placed nested layer has its written translate cleared on solved
        // axes, so `displayTranslate` would hoist children at [0,0].
        const childTx = child.projectedTranslate(0) ?? 0;
        const childTy = child.projectedTranslate(1) ?? 0;
        const nextAccTx = accTx + childTx;
        const nextAccTy = accTy + childTy;
        // Fold the payload through this hoisted layer (e.g. resolve its flip
        // scope) so the layer's children lower under it (#629).
        const nextPayload = fold
          ? fold.onHoist(payload, child, nextAccTx, nextAccTy)
          : payload;
        walk(child.children, nextAccTx, nextAccTy, nextPayload);
      } else {
        out.push({
          node: child,
          accTranslate: [accTx, accTy],
          defaultOrder: order++,
          defaultZ: child.getZOrder() ?? 0,
          payload,
        });
      }
    }
  }
}

/** A child of a transparent layer, in resolved paint order, paired with the
 *  translate accumulated across any transparent ancestors hoisted over it (0,0
 *  for a plain-index-ordered child) and the caller's folded `payload` (the seed
 *  for a plain child; see {@link flattenForZOrder}). Both the root `bake` and
 *  the coord-local `flattenLayout` recurse into these in order, adding
 *  `accTranslate` to the transform they compose down. */
export type PaintChild<P = undefined> = {
  node: GoFishAST;
  accTranslate: [number, number];
  payload: P;
};

/**
 * Resolve the draw order of a layer's children.
 *
 * If the layer carries `zAbove`/`zBelow` constraints, order its
 * component-granular flattened subtree topologically (hoisting nested plain
 * layers, accumulating their translate). Otherwise paint children in
 * `(local zOrder, index)` order. z-order is LOCAL to this layer either way.
 *
 * A caller may thread a `fold` payload down through each hoisted-through plain
 * layer (see {@link flattenForZOrder}): the root `bake` carries the y-flip
 * scope this way so a z-order hoist can never change a subtree's orientation
 * (#629). Plain (un-hoisted) children carry the seed. The coord-local
 * `flattenLayout` passes no fold — a `coord` fixes its own orientation
 * convention, so no flip scope threads through its interior.
 */
export function orderChildrenForPaint<P = undefined>(
  node: GoFishAST,
  fold?: {
    /** The payload active at this layer (each plain child's payload). */
    seed: P;
    /** Re-derive the payload under a hoisted-through plain layer. */
    onHoist: (payload: P, layer: GoFishNode, accTx: number, accTy: number) => P;
  }
): PaintChild<P>[] {
  if (!("children" in node) || !node.children) return [];
  const children = node.children;
  const zConstraints = (
    (node instanceof GoFishNode ? node.constraints : undefined) ?? []
  ).filter(isZOrderConstraint);

  if (zConstraints.length > 0) {
    // Resolve z WITHIN this layer over its component-granular flattened subtree.
    return topoSortByZOrder(
      flattenForZOrder<P>(children, fold),
      zConstraints
    ).map((unit) => ({
      node: unit.node,
      accTranslate: unit.accTranslate,
      payload: unit.payload,
    }));
  }

  // Plain layer: paint children in (local zOrder, index) order. With every
  // z-order at the default 0 that is just index order, so skip the sort.
  const zOf = (child: GoFishAST) =>
    child instanceof GoFishNode ? (child.getZOrder() ?? 0) : 0;
  const ordered = children.some((child) => zOf(child) !== 0)
    ? children
        .map((child, index) => ({ child, index }))
        .sort((a, b) => zOf(a.child) - zOf(b.child) || a.index - b.index)
        .map(({ child }) => child)
    : children;

  return ordered.map((child) => ({
    node: child,
    accTranslate: [0, 0] as [number, number],
    payload: fold?.seed as P,
  }));
}

/** The resolved string name of a node (`.name("…")`), or undefined for an
 *  unnamed node / a `GoFishRef`. */
const nodeName = (node: GoFishAST): string | undefined => {
  if (!(node instanceof GoFishNode) || node._name === undefined) {
    return undefined;
  }
  return isToken(node._name) ? node._name.__tag : node._name;
};

/**
 * Stable topological paint order: order `items` so every `zAbove`/`zBelow`
 * constraint is satisfied, breaking ties (and ordering the unconstrained
 * majority) by `(defaultZ, defaultOrder)`. Throws if the constraints form a
 * cycle.
 */
function topoSortByZOrder<P>(
  items: PaintItem<P>[],
  constraints: ZOrderConstraint[]
): PaintItem<P>[] {
  const n = items.length;

  // name → indices. Descent through nested layers can produce duplicates if
  // names collide; the constraint is applied to all matches.
  const nameToIndices = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const name = nodeName(items[i].node);
    if (name === undefined) continue;
    const arr = nameToIndices.get(name);
    if (arr) arr.push(i);
    else nameToIndices.set(name, [i]);
  }

  // Adjacency is allocated LAZILY: a layer can hold tens of thousands of paint
  // units while only a handful carry constraints (72 line connectors over
  // 26,280 point anchors in the bird-migration chart), so eagerly building one
  // Set per unit is pure overhead.
  const adj: (Set<number> | undefined)[] = new Array(n);
  const inDegree = new Array<number>(n).fill(0);
  const addEdge = (from: number, to: number) => {
    if (from === to) return;
    let out = adj[from];
    if (out === undefined) adj[from] = out = new Set<number>();
    if (out.has(to)) return;
    out.add(to);
    inDegree[to]++;
  };
  for (const c of constraints) {
    const aIdx = nameToIndices.get(c.children[0].name) ?? [];
    const bIdx = nameToIndices.get(c.children[1].name) ?? [];
    for (const ai of aIdx) {
      for (const bi of bIdx) {
        // zAbove(a, b): a paints LATER (over b) → edge b → a.
        // zBelow(a, b): a paints EARLIER (under b) → edge a → b.
        if (c.type === "zAbove") addEdge(bi, ai);
        else addEdge(ai, bi);
      }
    }
  }

  // Keys are read once per item: the comparator runs O(n log n) times.
  const zKey = new Array<number>(n);
  const orderKey = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    zKey[i] = items[i].defaultZ;
    orderKey[i] = items[i].defaultOrder;
  }
  // `(z, order)` with the item index as a final tiebreak. `order` is already
  // unique per item (it is the position in the flattened default order), so the
  // index only makes the comparison a total order on paper, which is what a
  // heap needs to be deterministic.
  const less = (i: number, j: number): boolean => {
    if (zKey[i] !== zKey[j]) return zKey[i] < zKey[j];
    if (orderKey[i] !== orderKey[j]) return orderKey[i] < orderKey[j];
    return i < j;
  };

  // Kahn's algorithm, always emitting the SMALLEST eligible unit by
  // `(z, order)`. The ready set is a binary min-heap rather than a re-sorted
  // array: the choice — and so the resulting order — is identical, but a
  // re-sort plus `shift()` per emission is quadratic in the number of units,
  // which is the whole cost of a large chart's paint order.
  const heap: number[] = [];
  const heapPush = (v: number) => {
    let i = heap.length;
    heap.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      const t = heap[p];
      heap[p] = heap[i];
      heap[i] = t;
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
        const t = heap[m];
        heap[m] = heap[i];
        heap[i] = t;
        i = m;
      }
    }
    return top;
  };

  for (let i = 0; i < n; i++) if (inDegree[i] === 0) heapPush(i);

  const result: PaintItem<P>[] = [];
  const emitted = new Array<boolean>(n).fill(false);
  while (heap.length > 0) {
    const i = heapPop();
    result.push(items[i]);
    emitted[i] = true;
    const out = adj[i];
    if (out === undefined) continue;
    for (const j of out) {
      if (--inDegree[j] === 0) heapPush(j);
    }
  }

  if (result.length < n) {
    const remaining = items
      .filter((_, i) => !emitted[i])
      .map((it) => nodeName(it.node) ?? "(unnamed)");
    throw new Error(
      `z-order constraints form a cycle; could not order: ${remaining.join(", ")}`
    );
  }
  return result;
}
