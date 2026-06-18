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
