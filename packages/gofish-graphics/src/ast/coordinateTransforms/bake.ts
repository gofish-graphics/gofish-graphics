// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject, FlipScope } from "../_displayObject";
import { mirrorY } from "../_displayObject";
import type { Transform } from "../dims";
import { GoFishNode } from "../_node";
import { orderChildrenForPaint } from "../paintOrder";
import { isCONTINUOUS } from "../underlyingSpace";

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

  // Resolve draw order the same way the root bake does (z-order LOCAL to this
  // layer), so `.zOrder(-1)` and `zAbove`/`zBelow` are honored inside a
  // coordinate transform, not silently dropped (#676). `accTranslate` carries
  // the translate of any transparent nested layers hoisted over a child by the
  // z-constraint flatten, matching how the root bake composes it.
  return orderChildrenForPaint(node).flatMap(({ node: child, accTranslate }) =>
    flattenLayout(
      child,
      [newTransform[0] + accTranslate[0], newTransform[1] + accTranslate[1]],
      newScale
    )
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

/** Does this node DECLARE y-up (issue #629)? A node declares y-up iff its own
 *  resolved y underlying space is CONTINUOUS — a value axis, a datum-positioned
 *  or baseline-magnitude y. ORDINAL / UNDEFINED declares nothing (inherits the
 *  ambient). The mirror opens at the *topmost* declaring node and mirrors about
 *  THAT node's own placed band: a single cohesive chart flips as a whole (its
 *  outermost continuous node covers the canvas), while a free-space mix — a bar
 *  chart beside a heatmap — has an ordinal/undefined union at the top, so the
 *  scope opens deeper, at each continuous subtree, and the ordinal neighbor keeps
 *  its own y-down frame. This is the shipped `subtreeHasContinuousY` global rule
 *  made local. Chrome is NOT excluded here (a titled chart's outer wrapper unions
 *  a continuous y and DOES declare); it opts out via `_ambientYDown` in `walk`. */
const declaredYUp = (node: GoFishAST): boolean => {
  if (!(node instanceof GoFishNode)) return false;
  const sy = node._underlyingSpace?.[1];
  if (sy !== undefined && isCONTINUOUS(sy)) return true;
  // A self-scaling scope (a `normalize` spine, a data-driven extent) resolves a
  // CONTINUOUS y locally but reports UNDEFINED upward to keep its units out of an
  // ancestor's scale union. For orientation it is still continuous, so it opens a
  // y-up flip scope over its own band exactly as a reported continuous y would —
  // otherwise a normalize mosaic's segments stack y-down inside the scope. #20.
  const ssy = node._selfScaledSpace?.[1];
  return ssy !== undefined && isCONTINUOUS(ssy);
};

/** The node's CONTENT bbox band `[baseY, baseY+height]` in its own local frame,
 *  read off `intrinsicDims[1]` (the `min` offset + `size`), finite-guarded (an
 *  unsized axis → 0). The band starts at `composedTy + min` — content seated at a
 *  nonzero local `min` (bars with negative values below the baseline, a
 *  datum-positioned min offset from local 0) must mirror about the band it
 *  actually occupies, not `[composedTy, composedTy+size]`. Shared by `scopeBox`'s
 *  unsized fallback AND the chrome box-mirror so the two mirrors never disagree. */
const contentBboxBand = (node: GoFishAST, composedTy: number): FlipScope => {
  const dim = node instanceof GoFishNode ? node.intrinsicDims?.[1] : undefined;
  const min = dim?.min !== undefined && Number.isFinite(dim.min) ? dim.min : 0;
  const size =
    dim?.size !== undefined && Number.isFinite(dim.size) ? dim.size : 0;
  return { baseY: composedTy + min, height: size };
};

/** The placed y-band `[baseY, baseY+height]` a node's flip scope mirrors about,
 *  in its own local frame. `height` is the node's ALLOCATED y size — its
 *  coordinate-frame pixel extent (the posScale range: cell height in a facet,
 *  glyph height for a nested chart). `baseY` is the frame ORIGIN — the node's
 *  local (0,0) in absolute coords (`composedTy`). The ROOT plot content does NOT
 *  use this: it carries an authoritative `_rootFlipScope` = the canvas frame
 *  `[0, finalH]` stamped by `layout()` (where `finalH = contentNode.dims.size` is
 *  known), which is the exact frame the old global flip mirrored about — see
 *  `walk`. `scopeBox` is for scopes that open BELOW the canvas frame (a facet
 *  cell, a `coord`), which mirror about their own allocated band. Falls back to
 *  the content bbox extent when the axis is UNSIZED (allocated NaN). */
const scopeBox = (node: GoFishAST, composedTy: number): FlipScope => {
  const gn = node instanceof GoFishNode ? node : undefined;
  const alloc = gn?._allocatedSize?.[1];
  // Allocated (coordinate-frame) extent: the band origin IS the frame origin
  // (`composedTy`). Unsized axis → fall back to the content bbox band, which
  // honors the bbox `min` (see `contentBboxBand`).
  return alloc !== undefined && Number.isFinite(alloc)
    ? { baseY: composedTy, height: alloc }
    : contentBboxBand(node, composedTy);
};

/** The single scope-decision rule (issue #629): the flip scope a node LOWERS
 *  UNDER, given the flip active at its parent (`incomingFlip`, already
 *  ambient-adjusted by the caller). A node OPENS a new scope — about its own
 *  placed band (`scopeBox`), or the authoritative `_rootFlipScope` for root
 *  content — iff none is active yet (`incomingFlip === undefined`) and its own y
 *  is CONTINUOUS (`declaredYUp`) or it is a `coord` (which fixes its own
 *  convention). Otherwise it INHERITS `incomingFlip`: a nested continuous node or
 *  a nested `coord` sees the scope already active and does NOT re-open it — the
 *  inherit-when-active rule that prevents a double flip (and places a nested
 *  `coord`'s BOX in its parent's frame while its own transform keeps the interior
 *  angular sense). A `_scopeTransparent` wrapper never opens (its bbox includes
 *  the chrome — the wrong band); an `_ambientYDown` chrome node never opens (its
 *  interior renders ambient). Extracted so the MAIN flatten and the z-order hoist
 *  run the SAME logic — one walk, not two — so adding a zOrder constraint (or
 *  wrapping in a bake boundary) can never change which scope a subtree lowers
 *  under. */
const resolveNodeFlip = (
  node: GoFishAST,
  composedTy: number,
  incomingFlip: FlipScope | undefined
): FlipScope | undefined => {
  if (incomingFlip !== undefined) return incomingFlip;
  if (node instanceof GoFishNode && node._ambientYDown === true)
    return undefined;
  // A `coord` opens its own scope (it fixes its own orientation convention).
  // This `type === "coord"` string dispatch is a stopgap: the deeper fix is for
  // `coord` to DECLARE its own orientation (a node bit / its own y underlying
  // space) so `declaredYUp` subsumes it — a follow-up to #629, gated on the open
  // polar/coord orientation redesign (#662).
  const isCoord = (node as { type?: string }).type === "coord";
  const scopeTransparent =
    node instanceof GoFishNode && node._scopeTransparent === true;
  if (!(isCoord || (declaredYUp(node) && !scopeTransparent))) return undefined;
  const rootScope =
    node instanceof GoFishNode ? node._rootFlipScope : undefined;
  return rootScope ?? scopeBox(node, composedTy);
};

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
/**
 * @param ambientFlip   the ambient seed (`options.yUp`) read by `_ambientYDown`
 *                      chrome nodes; also the default initial scope.
 * @param startTransform the absolute translate the walk starts from — `[0,0]` for
 *                      the root bake; a BAKE BOUNDARY re-bakes a child subtree
 *                      seeded with the boundary's own absolute translate, so the
 *                      resulting `FlipScope` bands (and leaf transforms) are in
 *                      the same absolute frame the boundary's `toPixel` consumes.
 * @param startFlip     the flip scope active at the walk root — the boundary's own
 *                      scope, so its descendants INHERIT it unless they open their
 *                      own (a continuous-y subtree inside an UNDEFINED-y boundary
 *                      like `enclose`/`arrow`/`connect` still flips; #629).
 */
export const bake = (
  root: GoFishAST,
  ambientFlip?: FlipScope,
  startTransform: [number, number] = [0, 0],
  startFlip: FlipScope | undefined = ambientFlip
): DisplayObject[] => {
  const items: DisplayObject[] = [];

  const walk = (
    node: GoFishAST,
    transform: [number, number],
    scale: [number, number],
    flip: FlipScope | undefined
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

    // Chrome (axis titles, legend column, colorbar — see `_ambientYDown`) is the
    // coord rule applied to annotation: the plot's frame PLACES the chrome's BOX,
    // but never re-interprets its INTERIOR (#629). Its constraints are authored in
    // the shared abstract frame (main-style, same side as the axis labels); here
    // the box is mirrored about the plot's flip scope (`chromeFrame`, the
    // `_rootFlipScope` found through the transparent wrapper) so it lands on the
    // same VISUAL edge as the flipped labels — while the subtree below renders
    // ambient (glyphs upright, legend rows top→bottom, colorbar max at top). When
    // the plot doesn't mirror there is no frame and chrome passes through
    // unchanged. Under a global `options.yUp` ambient the chrome is already
    // INSIDE the canvas-wide flip (`flip` active) and keeps it — the whole canvas
    // flips uniformly, as the old global flip did.
    const ambient = node instanceof GoFishNode && node._ambientYDown === true;
    // The chrome placement frame is stamped directly on this node by `layout()`
    // (`_chromeFrame`) — no walk-time search through the transparent wrappers.
    const chromeFrame =
      node instanceof GoFishNode ? node._chromeFrame : undefined;
    if (ambient && flip === undefined && chromeFrame !== undefined) {
      // Mirror the chrome's content box `[band.baseY, band.baseY+band.height]`
      // about the plot's frame band: y ↦ 2·baseY + height − y, applied to the
      // box as a whole (`contentBboxBand` is the SAME band `scopeBox` mirrors
      // about in its unsized fallback — the two must not disagree).
      const band = contentBboxBand(node, composedTranslate[1]);
      // The whole box mirrors about the frame: its new top edge is the mirror of
      // its old bottom edge; shift by (newTop − oldTop) = mirrorY(bottom) − top.
      composedTranslate[1] +=
        mirrorY(chromeFrame, band.baseY + band.height) - band.baseY;
    }
    // y-orientation scope (issue #629) — the single rule (`resolveNodeFlip`): a
    // node opens a y-up flip scope about its own placed band iff none is active
    // and its own y is CONTINUOUS or it is a `coord`; otherwise it inherits the
    // active scope (no double flip). An `_ambientYDown` chrome node reads the
    // ambient seed (`ambientFlip`), so it flips only under a global `options.yUp`.
    const incomingFlip = ambient ? ambientFlip : flip;
    const nodeFlip = resolveNodeFlip(node, composedTranslate[1], incomingFlip);

    if (!isTransparent(node)) {
      items.push({
        node,
        transform: { translate: composedTranslate, scale: composedScale },
        flip: nodeFlip,
      });
      return;
    }

    // Resolve this transparent layer's draw order with the shared rule (z-order
    // LOCAL to the layer, #676), then descend into each unit; `accTranslate`
    // carries the translate of any transparent ancestors hoisted over a unit.
    // The fold threads the flip scope through each hoisted-through plain layer
    // so a unit lowers under the SAME scope it would without the constraint
    // (issue #629): the z-order hoist must never change orientation. Plain
    // (un-hoisted) children carry the seed (`nodeFlip`).
    for (const { node: child, accTranslate, payload } of orderChildrenForPaint<
      FlipScope | undefined
    >(node, {
      seed: nodeFlip,
      onHoist: (incomingFlip, layer, _accTx, accTy) =>
        resolveNodeFlip(layer, composedTranslate[1] + accTy, incomingFlip),
    })) {
      walk(
        child,
        [
          composedTranslate[0] + accTranslate[0],
          composedTranslate[1] + accTranslate[1],
        ],
        composedScale,
        payload
      );
    }
  };

  walk(root, startTransform, [1, 1], startFlip);
  return items;
};
