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

/* The bake flattens a laid-out GoFishNode tree into a flat list of
   DisplayObjects (the rendering IR; see `../_displayObject.ts`), each carrying
   its absolute transform, so render needs no nested `<g transform>`
   recursion. DisplayObjects don't have children (inspired by tldraw a bit),
   which also makes z-ordering easier.
- TODO: a DisplayObject still references its source GoFishAST as the renderer; the end-state
  is self-contained primitives with no `node` back-reference (#75).
*/

/**
 * The RELATIONAL nodes: the ones that paint their operands' resolved geometry
 * rather than containing marks of their own. `connect` (behind `line` and
 * `ribbon`) draws the path through a run of marks; `tween` (behind
 * `time.transition()`) draws the mark the run passes through at the current
 * playhead. Their children are refs to marks that live elsewhere in the tree,
 * so the bake must treat them as boundaries — flattening through one would
 * drop its own geometry and re-emit the marks it is derived from.
 */
const RELATIONAL_TYPES = ["connect", "tween"];

// ── The bake ────────────────────────────────────────────────────────────────
//
// `bake` (below) is the ROOT bake: it flattens the *whole* scenegraph into one
// ordered `DisplayObject[]` that render consumes directly. `bakeSubtree` and
// `bakeChildren` are the same walk over one subtree, which a boundary that
// lowers its own children calls: `coord` bakes its children this way and
// warps each entry, and a compositor bakes each operand.
//
// The walk has two rules:
//
//  1. **Boundaries.** A node whose render is NOT reducible to "translate its
//     independent children" is a *bake boundary*: it emits a single DisplayObject
//     and lowers its own subtree. These are the space-remappers (`coord`), the
//     compositors (`over`/`atop`/`in`/`out`/`xor`), the cross-child
//     self-drawers (`connect`/`tween`/`arrow`/`enclose`/`box`/`axisSpan`),
//     `offset`, and any filtered node (it filters its subtree as one picture).
//     The root bake never recurses *through* a coordinate transform (which
//     would compose a single global translate through a space remap — see the
//     boundary-recursive note in the coord-flattening essay).
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

/** The compositors (`graphicalOperators/porterDuff.tsx`): they read their
 *  operands' shapes, so a hidden node under one lowers as its shape
 *  (`GoFishNode.visibility`). */
export const COMPOSITE_TYPES: ReadonlySet<string> = new Set([
  "over",
  "atop",
  "in",
  "out",
  "xor",
]);

/** The node types that are bake boundaries whatever their options
 *  (`GoFishNode.isBakeBoundary`, which adds a filtered node). TODO(#75
 *  follow-up): a new self-drawing operator not listed here silently
 *  mis-renders (its draw is dropped, its children hoisted); a flag the
 *  operator factory sets would not. */
export const BAKE_BOUNDARY_TYPES: ReadonlySet<string> = new Set([
  "coord",
  ...COMPOSITE_TYPES,
  ...RELATIONAL_TYPES,
  "arrow",
  "axisSpan",
  "enclose",
  "box",
  // Its shift is render-only (not a translate), so flattening through it
  // would drop the shift: it lowers its child itself (`lowerChildrenOffset`).
  "offset",
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
  !node.isBakeBoundary();

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
    // A hidden subtree draws nothing: the root bake never reaches into a
    // compositor, the one place a hidden node still gives its shape.
    if (node.isHidden()) return;
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

  walk(root, [0, 0], [1, 1]);
  return items;
};

/**
 * Flatten one subtree, `child` and what it holds, into absolute-transform
 * `DisplayObject`s at an already-composed `translate`/`scale`: `child` itself
 * when it lowers on its own, else its leaves (and boundaries) where it put
 * them, in paint order ({@link orderChildrenForPaint}). The caller lowers each
 * entry at its baked absolute transform (`INTERNAL_lower(coord,
 * d.transform)`), the mechanism the root bake uses, so a node that only
 * places its children (a `pack`, a `treemap`) needs no lowering of its own. A
 * compositor bakes each operand this way (`porterDuff.tsx`).
 */
export const bakeSubtree = (
  child: GoFishAST,
  translate: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): DisplayObject[] => {
  const items: DisplayObject[] = [];
  const walkNode = (
    n: GoFishAST,
    transform: [number, number],
    sc: [number, number]
  ): void => {
    // A hidden subtree draws nothing, unless a compositor reads its shape.
    if (n.isHidden() && n.visibility() === "none") return;
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

    for (const c of orderChildrenForPaint(n)) {
      walkNode(c, composedTranslate, composedScale);
    }
  };
  walkNode(child, translate, scale);
  return items;
};

/**
 * Flatten a node's CHILDREN into absolute-transform `DisplayObject`s at an
 * already-composed `translate`/`scale`, each child's subtree through
 * {@link bakeSubtree}, in paint order: the shared body for a translate-only
 * barrier (a `box`/`layer` coordinate-transform barrier, and the boundaries
 * that lower through `lowerChildrenOffset`), so a translate-only boundary
 * needs no per-container `toPixel` closure (#39 stage 6d). z-order is
 * resolved identically to {@link bake} via the shared
 * {@link orderChildrenForPaint}.
 *
 * It descends into `node`'s CHILDREN, never `node` itself: `node` is the
 * boundary, which `isTransparent` reports as opaque, so baking it as a
 * subtree would re-emit `node` as its own entry and recurse forever when the
 * caller lowers that entry.
 */
export const bakeChildren = (
  node: GoFishAST,
  translate: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): DisplayObject[] =>
  orderChildrenForPaint(node).flatMap((child) =>
    bakeSubtree(child, translate, scale)
  );
