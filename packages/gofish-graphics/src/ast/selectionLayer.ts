// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

/**
 * A modifier lowered as a layer over its selection.
 *
 * A mark modifier such as `.label()` draws something over the nodes it is
 * chained on. Written out by hand, that is one more tier over a selection:
 *
 * ```ts
 * chart(data).flow(spread({ by: "site" }).name("sites")).mark(rect(...))
 *   .layer(chart(selectAll("sites")).mark(...))
 * ```
 *
 * This module is the part of that rewrite every such modifier shares. The
 * modifier stamps its calls on the nodes it reaches while the chart is built
 * (as `.label()` stamps `_labels`). After the chrome pass, on the finished
 * tree, `lowerSelectionLayers` takes the stamps off ({@link SelectionLayer.take}),
 * gives each node it reached its home (the content of the nearest `chart()`
 * around it, or the render root), and draws one tier over each home's
 * selection ({@link SelectionLayer.draw}): the home's content and the tier's
 * shapes in one hygienic layer (a ring, `wrapRing`), seated by the
 * constraints the tier returns. Homes are drawn deepest first, so a tier
 * reads what the tiers of the charts inside it drew, already placed.
 *
 * Each selected node is read through a ref made the way `selectAll` makes
 * one ({@link selectNode}), so a tier sees what a hand-written
 * `chart(selectAll(...))` tier sees: one ref per node, whose `datum` is the
 * node's rows.
 *
 * It is not `.layer()` itself. A `.layer()` tier is resolved with its chart,
 * before chrome, and framed as a chart of its own; a modifier's tier is drawn
 * after chrome, beside the marks it reads, in the same layer as their refs, so
 * its constraints can relate its shapes to them and a tier placed after the
 * solve (the label chooser) sees every one of them. See
 * apps/docs/docs/internals/frontend/labels.md.
 */

import { GoFishNode } from "./_node";
import type { GoFishRef } from "./_ref";
import { selectNode } from "./marks/resolveRefData";
import {
  wrapPreservingIdentity,
  wrapRing,
  type ChromeRing,
} from "./elaborationUtils";

export { selectNode };

/** One tier over one home, as a {@link SelectionLayer} draws it: the ring's
 *  shapes and constraints (`ChromeRing`), and what it drew, which the tiers
 *  of the homes around it read. */
export type DrawnTier<D> = ChromeRing & { drawn: D };

/** A modifier that lowers to a layer over its selection. `E` is one stamp
 *  taken off the tree (a `.label()` spec on its target), `D` what one tier
 *  drew (the labels it seated). */
export type SelectionLayer<E, D> = {
  /** Take the modifier's stamps off the tree under `root`, in the order the
   *  tier draws them. */
  take(root: GoFishNode): E[];
  /** The node a stamp is drawn over. */
  target(entry: E): GoFishNode;
  /**
   * The tier over one home: `entries` are the home's stamps, in order;
   * `select` reads a node through a ref, as `selectAll` does; `inside` is
   * what the tiers of the homes inside this one drew. Called once per home,
   * when its content is about to be wrapped.
   */
  draw(
    entries: E[],
    env: {
      home: GoFishNode;
      select: (node: GoFishNode) => GoFishRef;
      inside: D[];
    }
  ): Promise<DrawnTier<D>> | DrawnTier<D>;
};

/**
 * The node a selected node's tier goes on: the content of the nearest
 * `chart()` around it (`_chartContent`, inside the chart's chrome rings),
 * the node itself when it is one, or `root`, the render root, when no chart
 * holds it. In a `.layer()` chain, that is the node's own tier, and the
 * transitions a chart draws over its marks are not in it, so they read the
 * tier placed.
 */
export function homeOf(target: GoFishNode, root: GoFishNode): GoFishNode {
  for (let n: GoFishNode | undefined = target; n; n = n.parent)
    if (n._chartContent) return n;
  return root;
}

/**
 * Lower every stamp of `modifier` in `root`'s tree: one tier per home, each
 * home's content wrapped once with its tier, the deepest homes first. The
 * wrapper takes the home's place in its parent (or is the new root).
 */
export async function lowerSelectionLayers<E, D>(
  root: GoFishNode,
  modifier: SelectionLayer<E, D>
): Promise<{ node: GoFishNode; changed: boolean }> {
  const entries = modifier.take(root);
  if (entries.length === 0) return { node: root, changed: false };
  const homes = new Map<GoFishNode, E[]>();
  for (const e of entries) {
    const home = homeOf(modifier.target(e), root);
    const here = homes.get(home);
    if (here === undefined) homes.set(home, [e]);
    else here.push(e);
  }
  // A home is wrapped after the homes inside it, so its tier reads theirs,
  // already drawn.
  const depth = (n: GoFishNode) => {
    let d = 0;
    for (let p = n.parent; p; p = p.parent) d++;
    return d;
  };
  const order = [...homes].sort(([a], [b]) => depth(b) - depth(a));
  const done: { node: GoFishNode; drawn: D }[] = [];
  let out = root;
  for (const [home, here] of order) {
    const parent = home.parent;
    const inside = done
      .filter((d) => isInside(d.node, home))
      .map((d) => d.drawn);
    let drawn!: D;
    const wrapped = await wrapPreservingIdentity(home, async (content) => {
      const tier = await modifier.draw(here, {
        home: content,
        select: selectNode,
        inside,
      });
      drawn = tier.drawn;
      return wrapRing(content, tier);
    });
    done.push({ node: wrapped, drawn });
    if (home === root) out = wrapped;
    else parent!.replaceChild(parent!.indexOfChild(home)!, wrapped);
  }
  return { node: out, changed: true };
}

/** Whether `n` is in `home`'s subtree, below it. */
function isInside(n: GoFishNode, home: GoFishNode): boolean {
  for (let p = n.parent; p; p = p.parent) if (p === home) return true;
  return false;
}
