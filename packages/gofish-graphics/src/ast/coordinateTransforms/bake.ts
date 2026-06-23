// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject } from "../_displayObject";
import type { Transform } from "../dims";
import { GoFishNode } from "../_node";
import { isZOrderConstraint } from "../constraints/zorder";
import { flattenForZOrder, topoSortByZOrder } from "../paintOrder";

/** The node's parent-frame translate as the bake should compose it, via the
 *  polymorphic `projectedTranslate`: a `GoFishNode` reports the LEDGER projection
 *  (so the bake stays correct once a mutator records a position in the ledger but
 *  stops writing `transform.translate`, stage 3); a `GoFishRef` has no ledger and
 *  reports its computed transform. Inert today (projection == written field). */
const bakeTranslate = (node: GoFishAST): [number, number] => [
  node.projectedTranslate(0) ?? 0,
  node.projectedTranslate(1) ?? 0,
];

/* takes in a GoFishNode and bakes it into a flat list of DisplayObjects (the
   rendering IR; see `../_displayObject.ts`)
- layout: during layout, they flatten their child hierarchy completely, so it's easy to transform them (and
  also because coord doesn't care about graphical operators, only positions)
- rendering: then, during rendering, each mark applies its coordinate transform context. its behavior is
  influenced by its mark embedding "mode"
- DisplayObjects don't have children (inspired by tldraw a bit). also makes stuff like z-indexing
  easier later...
- TODO: a DisplayObject still references its source GoFishAST as the renderer; the end-state
  is self-contained primitives with no `node` back-reference.
*/

export const flattenLayout = (
  node: GoFishAST,
  transform: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): DisplayObject[] => {
  // recursive function
  // as we go down the tree we accumulate transforms
  // we apply the cumulative transform to all nodes we hit and remove their children
  //   this includes operators and marks
  // we EMIT the baked absolute transform on each DisplayObject rather than
  // MUTATING node.transform — render reads it via INTERNAL_render's transform
  // override, so the scenegraph's parent-relative transforms stay intact.

  /* TODO: `connect` is a hack to get the operator to render in coordinate spaces
       A more principled way to do this would be to have "connect" produce a child path mark.
  */
  if (
    !("children" in node) ||
    !node.children ||
    node.children.length === 0 ||
    node.type === "connect" ||
    node.type === "box"
  ) {
    const [ownTx, ownTy] = bakeTranslate(node);
    return [
      {
        node,
        transform: {
          translate: [ownTx + transform[0]!, ownTy + transform[1]!],
          scale: [
            (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
            (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
          ],
        },
      },
    ];
  }

  const [ownTx, ownTy] = bakeTranslate(node);
  const newTransform: [number, number] = [
    transform[0]! + ownTx,
    transform[1]! + ownTy,
  ];

  const newScale: [number, number] = [
    (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
    (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
  ];

  return node.children.flatMap((child) =>
    flattenLayout(child, newTransform, newScale)
  );
};

// ── The universal bake ──────────────────────────────────────────────────────
//
// `flattenLayout` (above) is the COORD-local bake: `coord` calls it on each child
// to flatten its own subtree into screen-space draw entries, which it then warps.
// `bake` (below) is the ROOT bake: it flattens the *whole* scenegraph into one
// ordered `DisplayObject[]` that render consumes directly, replacing the nested
// `<g transform>` recursion.
//
// The difference from `flattenLayout` is twofold:
//
//  1. **Boundaries.** A node whose render is NOT reducible to "translate its
//     independent children" is a *bake boundary*: it emits a single DisplayObject
//     and renders its own subtree internally (via `INTERNAL_render`). These are
//     the space-remappers (`coord`), the compositors (`over`/`atop`/`in`/`out`/
//     `xor`/`mask`), and the cross-child self-drawers (`connect`/`arrow`/
//     `enclose`/`box`) — plus any label-bearing node (its label draws with it).
//     `coord` therefore stays a boundary here and keeps using `flattenLayout`
//     internally; the root bake never recurses *through* a coordinate transform
//     (which would compose a single global translate through a space remap — see
//     the boundary-recursive note in the coord-flattening essay).
//
//  2. **Draw order.** Render order previously lived in `layer` (a `(zOrder, index)`
//     sort, or a `zAbove`/`zBelow` topological sort). Flattening through `layer`
//     would drop that, so the bake resolves draw order globally over the flattened
//     list — the same algorithm, lifted out of `layer`. `layer` is consequently a
//     *transparent* operator here (it only contributes a translate/scale and its
//     z-order constraints).
//
// TODO: like `flattenLayout`, a baked entry still references its source node as the
// renderer; the end-state (#75) is self-contained primitives (`DisplayItem`).

// TODO(#75 follow-up): "is this a bake boundary?" is currently a centralized
// string set — a new self-drawing operator not listed here silently mis-renders
// (its draw is dropped, its children hoisted). The right altitude is a flag the
// operator factory sets on the node (like `_isComponent` / `_zOrder`), read once
// via a polymorphic `node.isBakeBoundary()`; that would also subsume the `_label`
// reach in `isTransparent` and `flattenLayout`'s inline `connect`/`box` cases.
const BAKE_BOUNDARY_TYPES = new Set([
  "coord",
  "over",
  "atop",
  "in",
  "out",
  "xor",
  "mask",
  "connect",
  "arrow",
  "enclose",
  "box",
]);

/** A node is *transparent* to the root bake (flattened through, contributing only
 *  its transform) iff it is a pure positioning operator: it has children, is not a
 *  boundary type, and carries no label of its own. Everything else is a boundary
 *  (or a leaf) and emits a single DisplayObject. */
const isTransparent = (node: GoFishAST): boolean =>
  "children" in node &&
  !!node.children &&
  node.children.length > 0 &&
  !BAKE_BOUNDARY_TYPES.has((node as { type?: string }).type ?? "") &&
  !(node instanceof GoFishNode && node._label !== undefined);

/** The `_zOrder` hint of a node (0 for a `GoFishRef`). */
const zOf = (node: GoFishAST): number =>
  node instanceof GoFishNode ? node.getZOrder() : 0;

/**
 * Flatten a resolved scenegraph into an ordered list of `DisplayObject`s.
 *
 * Paint order is resolved HIERARCHICALLY — per transparent layer, over its
 * component-granular children — exactly as the legacy `layer` render did, NOT
 * by a single global sort. This matters because a `zOrder(-1)` (or a
 * `zAbove`/`zBelow` constraint) is LOCAL to its layer: it orders a child behind
 * its siblings in that layer, not behind the whole chart. A global flatten
 * regroups e.g. all connectors before all marks across sibling layers (#607);
 * resolving each layer's own order and only then descending preserves the
 * legacy interleaving. Transforms still compose all the way to the leaves.
 */
export const bake = (root: GoFishAST): DisplayObject[] => {
  const items: DisplayObject[] = [];

  const walk = (
    node: GoFishAST,
    transform: [number, number],
    scale: [number, number]
  ): void => {
    const [ownTx, ownTy] = bakeTranslate(node);
    const composedTranslate: [number, number] = [
      ownTx + transform[0],
      ownTy + transform[1],
    ];
    const composedScale: [number, number] = [
      (node.transform?.scale?.[0] ?? 1) * scale[0],
      (node.transform?.scale?.[1] ?? 1) * scale[1],
    ];

    if (!isTransparent(node)) {
      items.push({
        node,
        transform: { translate: composedTranslate, scale: composedScale },
      });
      return;
    }

    const children = (node as GoFishNode).children;
    const zConstraints = ((node as GoFishNode).constraints ?? []).filter(
      isZOrderConstraint
    );

    if (zConstraints.length > 0) {
      // Resolve z WITHIN this layer over its component-granular flattened
      // subtree (the same units the legacy layer render topo-sorted), then
      // descend into each unit — components keep their internal order.
      const sorted = topoSortByZOrder(
        flattenForZOrder(children),
        zConstraints,
        {
          node: (it) => it.node,
          z: (it) => it.defaultZ,
          order: (it) => it.defaultOrder,
        }
      );
      for (const unit of sorted) {
        walk(
          unit.node,
          [
            composedTranslate[0] + unit.accTranslate[0],
            composedTranslate[1] + unit.accTranslate[1],
          ],
          composedScale
        );
      }
      return;
    }

    // Plain layer: paint children in (local zOrder, index) order.
    const ordered = children
      .map((child, index) => ({ child, index }))
      .sort((a, b) => zOf(a.child) - zOf(b.child) || a.index - b.index);
    for (const { child } of ordered) {
      walk(child, composedTranslate, composedScale);
    }
  };

  walk(root, [0, 0], [1, 1]);
  return items;
};
