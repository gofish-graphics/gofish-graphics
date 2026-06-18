// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject } from "../_displayObject";
import type { Transform } from "../dims";
import { GoFishNode } from "../_node";
import {
  isZOrderConstraint,
  type ZOrderConstraint,
} from "../constraints/zorder";
import { topoSortByZOrder } from "../paintOrder";

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

type BakeItem = {
  node: GoFishAST;
  transform: Transform;
  /** Position in the flattened default order — the stable tiebreaker. */
  order: number;
  /** `zOrder(n)` hint — the primary draw-order key. */
  z: number;
};

/** Order the flattened paint list. The unconstrained majority is a stable
 *  `(z, order)` sort; when `zAbove`/`zBelow` constraints are present the shared
 *  {@link topoSortByZOrder} resolves them — the same resolution `layer` runs,
 *  now over the whole flattened list rather than per-layer. This per-layer →
 *  global lift has two known latent divergences (a `zOrder()` on a transparent
 *  intermediate layer is not propagated; cross-layer ref-name collisions widen
 *  the cycle surface) — tracked in #607; no current chart exercises either. */
const orderByZ = (
  items: BakeItem[],
  constraints: ZOrderConstraint[]
): BakeItem[] => {
  if (constraints.length === 0) {
    return [...items].sort((a, b) => a.z - b.z || a.order - b.order);
  }
  return topoSortByZOrder(items, constraints, {
    node: (it) => it.node,
    z: (it) => it.z,
    order: (it) => it.order,
  });
};

export const bake = (root: GoFishAST): DisplayObject[] => {
  const items: BakeItem[] = [];
  const zConstraints: ZOrderConstraint[] = [];
  let order = 0;

  const walk = (
    node: GoFishAST,
    transform: [number, number],
    scale: [number, number]
  ): void => {
    if (node instanceof GoFishNode && node.constraints) {
      for (const c of node.constraints) {
        if (isZOrderConstraint(c)) zConstraints.push(c);
      }
    }

    const [ownTx, ownTy] = bakeTranslate(node);
    const composedTranslate: [number, number] = [
      ownTx + transform[0],
      ownTy + transform[1],
    ];
    const composedScale: [number, number] = [
      (node.transform?.scale?.[0] ?? 1) * scale[0],
      (node.transform?.scale?.[1] ?? 1) * scale[1],
    ];

    if (isTransparent(node)) {
      for (const child of (node as GoFishNode).children) {
        walk(child, composedTranslate, composedScale);
      }
      return;
    }

    items.push({
      node,
      transform: { translate: composedTranslate, scale: composedScale },
      order: order++,
      z: node instanceof GoFishNode ? node.getZOrder() : 0,
    });
  };

  walk(root, [0, 0], [1, 1]);
  return orderByZ(items, zConstraints).map(({ node, transform }) => ({
    node,
    transform,
  }));
};
