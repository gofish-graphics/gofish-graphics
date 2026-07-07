// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { GoFishNode } from "./_node";
import type { GoFishAST } from "./_ast";
import { isToken } from "./createName";
import type { ZOrderConstraint } from "./constraints/zorder";

/**
 * Paint-order resolution shared by the `layer` z-order pass and the root
 * `bake`. Both flatten a subtree into a paint list and then order it against
 * the same `zAbove`/`zBelow` semantics; this is that ordering, parameterized
 * over the item shape so each caller keeps its own (`PaintItem` vs `BakeItem`).
 */

/**
 * A single paint unit in a layer's z-order resolution. Components stay whole
 * (one PaintItem); only plain non-component nested layers are flattened through
 * — so a mark/component is ordered as a unit, matching the legacy layer render.
 */
export type PaintItem<P = undefined> = {
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
   *  pass no fold (the `layer` z-order pass); the root `bake` threads the flip
   *  scope through here so a hoisted unit lowers under the same scope it would
   *  without the constraint (#629). */
  payload: P;
};

/**
 * Flatten a layer's children into a paint list at COMPONENT granularity: plain
 * (non-component) nested `layer`s are transparent and hoist their children into
 * this paint context (accumulating translate), while components and leaves stay
 * as single units. Shared by the `layer` z-order pass and the root `bake` so
 * both resolve z-order over the same units.
 *
 * A caller may thread a `fold` payload down through each hoisted-through plain
 * layer (seeded once, re-derived at each hoist via `fold.onHoist`), surfaced on
 * each `PaintItem.payload`. The root `bake` uses it to carry the flip scope
 * through hoisted layers so a z-order constraint can never change a subtree's
 * orientation (#629); the `layer` pass passes no fold and gets `undefined`.
 */
export function flattenForZOrder<P = undefined>(
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
      if (!child._isComponent && child.type === "layer") {
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
          defaultZ: child.getZOrder(),
          payload,
        });
      }
    }
  }
}

/** The resolved string name of a node (`.name("…")`), or undefined for an
 *  unnamed node / a `GoFishRef`. */
export const nodeName = (node: GoFishAST): string | undefined => {
  if (!(node instanceof GoFishNode) || node._name === undefined) {
    return undefined;
  }
  return isToken(node._name) ? node._name.__tag : node._name;
};

export interface ZOrderAccessors<T> {
  node: (item: T) => GoFishAST;
  /** `zOrder(n)` hint — the primary draw-order key. */
  z: (item: T) => number;
  /** Position in the default flattened order — the stable tiebreaker. */
  order: (item: T) => number;
}

/**
 * Stable topological paint order: order `items` so every `zAbove`/`zBelow`
 * constraint is satisfied, breaking ties (and ordering the unconstrained
 * majority) by `(z, order)`. Throws if the constraints form a cycle.
 */
export function topoSortByZOrder<T>(
  items: T[],
  constraints: ZOrderConstraint[],
  acc: ZOrderAccessors<T>
): T[] {
  const n = items.length;

  // name → indices. Descent through nested layers can produce duplicates if
  // names collide; the constraint is applied to all matches.
  const nameToIndices = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const name = nodeName(acc.node(items[i]));
    if (name === undefined) continue;
    const arr = nameToIndices.get(name);
    if (arr) arr.push(i);
    else nameToIndices.set(name, [i]);
  }

  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const inDegree = new Array<number>(n).fill(0);
  const addEdge = (from: number, to: number) => {
    if (from === to || adj[from].has(to)) return;
    adj[from].add(to);
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

  const cmp = (i: number, j: number): number =>
    acc.z(items[i]) - acc.z(items[j]) ||
    acc.order(items[i]) - acc.order(items[j]);
  const eligible: number[] = [];
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) eligible.push(i);

  const result: T[] = [];
  const emitted = new Array<boolean>(n).fill(false);
  while (eligible.length > 0) {
    eligible.sort(cmp);
    const i = eligible.shift()!;
    result.push(items[i]);
    emitted[i] = true;
    for (const j of adj[i]) {
      if (--inDegree[j] === 0) eligible.push(j);
    }
  }

  if (result.length < n) {
    const remaining = items
      .filter((_, i) => !emitted[i])
      .map((it) => nodeName(acc.node(it)) ?? "(unnamed)");
    throw new Error(
      `z-order constraints form a cycle; could not order: ${remaining.join(", ")}`
    );
  }
  return result;
}
