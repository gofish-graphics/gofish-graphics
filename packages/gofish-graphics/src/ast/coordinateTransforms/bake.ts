// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject } from "../_displayObject";
import { orderChildrenForPaint } from "../paintOrder";

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

/**
 * The RELATIONAL nodes: the ones that paint their operands' resolved geometry
 * rather than containing marks of their own. `connect` (behind `line` and
 * `ribbon`) draws the path through a run of marks; `tween` (behind
 * `time.transition()`) draws the mark the run passes through at the current
 * playhead. Their children are refs to marks that live elsewhere in the tree,
 * so the bake must treat them as leaves — flattening through one would drop
 * its own geometry and re-emit the marks it is derived from.
 */
const RELATIONAL_TYPES = new Set(["connect", "tween"]);
const isRelational = (node: GoFishAST): boolean =>
  RELATIONAL_TYPES.has((node as { type?: string }).type ?? "");

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

  /* TODO: the relational types are a hack to get the operator to render in
       coordinate spaces. A more principled way to do this would be to have
       them produce a child mark.
  */
  if (
    !("children" in node) ||
    !node.children ||
    node.children.length === 0 ||
    isRelational(node) ||
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

  // Resolve draw order the same way the root bake does (z-order LOCAL to this
  // layer), so `.zOrder(-1)` and `zAbove`/`zBelow` are honored inside a
  // coordinate transform, not silently dropped (#676).
  return orderChildrenForPaint(node).flatMap((child) =>
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
//  2. **Draw order.** Each transparent node orders its own children with the
//     shared rule (`orderChildrenForPaint`) before descending into them, so
//     `layer` is a *transparent* operator here: it contributes a translate/scale
//     and its z-order constraints. A boundary that paints its children in turn
//     (`coord`, `box`, `enclose`, `offset`, `arrow`) asks the same rule for
//     their order when it lowers them, so a z constraint that parts inside a
//     boundary still takes effect. The compositors have no such order (they
//     paint one combined result) and throw if a z constraint parts at them
//     (`assertNoPaintOrder`).
//
// TODO: like `flattenLayout`, a baked entry still references its source node as the
// renderer; the end-state (#75) is self-contained primitives (`DisplayItem`).

// TODO(#75 follow-up): "is this a bake boundary?" is currently a centralized
// string set — a new self-drawing operator not listed here silently mis-renders
// (its draw is dropped, its children hoisted). The right altitude is a flag the
// operator factory sets on the node (like `_isComponent` / `_zOrder`), read once
// via a polymorphic `node.isBakeBoundary()`; that would also subsume
// `flattenLayout`'s inline `connect`/`box` cases.
const BAKE_BOUNDARY_TYPES = new Set([
  "coord",
  "over",
  "atop",
  "in",
  "out",
  "xor",
  "mask",
  ...RELATIONAL_TYPES,
  "arrow",
  "enclose",
  "box",
]);

/** A node is *transparent* to the root bake (flattened through, contributing only
 *  its transform) iff it is a pure positioning operator: it has children and is
 *  not a boundary type. Everything else is a boundary (or a leaf) and emits a
 *  single DisplayObject. (Labels used to force a boundary here — they now
 *  elaborate into ordinary sibling `Text` nodes before layout, so a labeled
 *  node is transparent like any other.) */
const isTransparent = (node: GoFishAST): boolean =>
  "children" in node &&
  !!node.children &&
  node.children.length > 0 &&
  !BAKE_BOUNDARY_TYPES.has((node as { type?: string }).type ?? "");

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
export const bake = (
  root: GoFishAST,
  startTransform: [number, number] = [0, 0]
): DisplayObject[] => {
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

    // Resolve this transparent node's draw order with the shared rule (z-order
    // LOCAL to its children, #676, #982), then descend into each child.
    for (const child of orderChildrenForPaint(node)) {
      walk(child, composedTranslate, composedScale);
    }
  };

  walk(root, startTransform, [1, 1]);
  return items;
};

/**
 * Flatten a node's CHILDREN into absolute-transform `DisplayObject`s at an
 * already-composed `translate`/`scale` — the shared body for a translate-only
 * barrier (a `box`/`layer` coordinate-transform barrier). The boundary lowers each returned entry at its baked absolute transform (via
 * `INTERNAL_lower(coord, d.transform)`) — the same mechanism the root bake
 * uses — so a translate-only boundary
 * needs no per-container `toPixel` closure (#39 stage 6d). z-order is
 * resolved identically to {@link bake} via the shared
 * {@link orderChildrenForPaint}.
 */
export const bakeChildren = (
  node: GoFishAST,
  translate: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): DisplayObject[] => {
  const items: DisplayObject[] = [];

  const walkNode = (
    n: GoFishAST,
    transform: [number, number],
    sc: [number, number]
  ): void => {
    const [ownTx, ownTy] = bakeTranslate(n);
    const composedTranslate: [number, number] = [
      ownTx + transform[0],
      ownTy + transform[1],
    ];
    const composedScale: [number, number] = [
      (n.transform?.scale?.[0] ?? 1) * sc[0],
      (n.transform?.scale?.[1] ?? 1) * sc[1],
    ];

    if (!isTransparent(n)) {
      items.push({
        node: n,
        transform: { translate: composedTranslate, scale: composedScale },
      });
      return;
    }

    for (const child of orderChildrenForPaint(n)) {
      walkNode(child, composedTranslate, composedScale);
    }
  };

  // Always descend into `node`'s CHILDREN, never `node` itself — `node` here is
  // the boundary/barrier (a `box`/`layer` type in `BAKE_BOUNDARY_TYPES`), which
  // `isTransparent` correctly reports as opaque; walking it through `walkNode`
  // directly would re-emit `node` as its own leaf DisplayObject and infinitely
  // recurse when the caller lowers that entry (its `lower` body calls
  // `bakeChildren(node, ...)` again). Iterating `node`'s children up front,
  // exactly like the root `bake`'s own top-level fold, is what makes this a
  // CHILDREN flatten rather than a whole-subtree one.
  for (const child of orderChildrenForPaint(node)) {
    walkNode(child, translate, scale);
  }
  return items;
};
