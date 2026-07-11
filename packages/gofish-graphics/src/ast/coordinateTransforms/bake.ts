// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject, FlipScope } from "../_displayObject";
import { mirrorY } from "../_displayObject";
import type { Transform } from "../dims";
import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import { orderChildrenForPaint } from "../paintOrder";
import { isCONTINUOUS } from "../underlyingSpace";
import { BOX_ANCHOR } from "../constraints/placementProgramLowerer";

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
  return sy !== undefined && isCONTINUOUS(sy);
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
 *  the content bbox extent when the axis is UNSIZED (allocated NaN).
 *
 *  FIXED-PITCH EXCEPTION: a target chained by a fixed-pitch `distribute` on y
 *  (`anchor: "baseline" | "start" | "middle" | "end"`; see `Placeable.
 *  pitchAnchorY`) is an OVERLAY row, not a tile — its allocated band is just the
 *  leftover slice and bears no relation to its chained anchor. Its scope mirrors
 *  about the chained anchor itself (a degenerate height-0 band: y ↦ 2·anchor −
 *  y), the unique mirror that FIXES the anchor pointwise — so the painted
 *  anchors sit exactly where the solver chained them, at exact pitch, and
 *  content rises above its baseline instead of being displaced by the
 *  meaningless slice height. */
const scopeBox = (node: GoFishAST, composedTy: number): FlipScope => {
  const gn = node instanceof GoFishNode ? node : undefined;
  const pitchAnchor = gn?.pitchAnchorY;
  if (pitchAnchor !== undefined) {
    const local = gn!.localAnchor("y", BOX_ANCHOR[pitchAnchor]);
    if (local !== undefined) return { baseY: composedTy + local, height: 0 };
  }
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
/** Would `node` OPEN a y-up flip scope if none were active? The open condition
 *  shared by {@link resolveNodeFlip} (the main walk) and {@link connectOperandFlip}
 *  (re-running the scope decision along an operand's ancestor path) — the single
 *  centralized copy of the condition. A `coord` opens its own scope (it fixes its
 *  own orientation convention). This `type === "coord"` string dispatch is a
 *  stopgap: the deeper fix is for `coord` to DECLARE its own orientation (a node
 *  bit / its own y underlying space) so `declaredYUp` subsumes it — a follow-up to
 *  #629, gated on the open polar/coord orientation redesign (#662). */
const opensFlipScope = (node: GoFishAST): boolean => {
  if (node instanceof GoFishNode && node._ambientYDown === true) return false;
  const isCoord = (node as { type?: string }).type === "coord";
  const scopeTransparent =
    node instanceof GoFishNode && node._scopeTransparent === true;
  return isCoord || (declaredYUp(node) && !scopeTransparent);
};

const resolveNodeFlip = (
  node: GoFishAST,
  composedTy: number,
  incomingFlip: FlipScope | undefined
): FlipScope | undefined => {
  if (incomingFlip !== undefined) return incomingFlip;
  if (!opensFlipScope(node)) return undefined;
  const rootScope =
    node instanceof GoFishNode ? node._rootFlipScope : undefined;
  return rootScope ?? scopeBox(node, composedTy);
};

/**
 * The #657 SINGLE-SCOPE case: a relational connector (`connect` — the node
 * behind `line`/`ribbon`) paints its OPERANDS' geometry, but it lives as a
 * sibling tier outside their subtrees, so when no scope is active at its own
 * altitude it lowers unflipped even though its operands mirror inside their own
 * scopes (e.g. per-row scopes under a fixed-pitch distribute) — drawing the
 * band upside-down and displaced. When every operand lowers under the SAME
 * scope, the connector must adopt it; operands under different scopes (or
 * none) keep today's behavior (the deferred multi-scope case — see the
 * LIMITATION note in connect.tsx's `lower`).
 *
 * `composedTy` is the connector's composed translate in this bake's frame; the
 * operand scopes are reconstructed by re-running the scope decision along each
 * operand's ancestor path below its common ancestor with the connector (the
 * scope structure is a pure function of the tree, so this agrees with what the
 * main walk assigns the operands themselves). Returns the shared scope, or
 * `undefined` when there isn't exactly one.
 */
const connectOperandFlip = (
  node: GoFishNode,
  composedTy: number
): FlipScope | undefined => {
  const children = (node.children ?? []) as GoFishAST[];
  if (children.length === 0) return undefined;

  // The connector's ancestor chain, with the absolute y of each ancestor's
  // FRAME: frameTy(A) = composedTy − Σ ownTy over the path from the connector
  // up to (excluding) A.
  //
  // NOTE: this hand-rolls the ancestor walk rather than calling
  // `findLeastCommonAncestor`/`findPathToRoot` (`_ref.tsx`) because the two are
  // NOT drop-in here: `findLeastCommonAncestor(node, operand)` would return
  // `node` itself when an operand happens to be a descendant of the connector
  // (LCA of an ancestor/descendant pair is the ancestor), whereas this walk
  // needs the least ancestor that is STRICTLY ABOVE the connector (`frameTy`
  // is keyed by proper ancestors only, `node.parent` onward) — the per-operand
  // scope has to be an ancestor common to *siblings*, not the connector's own
  // subtree. Reusing the generic LCA would silently change which node is
  // treated as the opener for that edge case.
  const frameTy = new Map<GoFishNode, number>();
  {
    let acc = composedTy - (node.projectedTranslate(1) ?? 0);
    let cur: GoFishNode | undefined = node.parent;
    while (cur) {
      frameTy.set(cur, acc);
      acc -= cur.projectedTranslate(1) ?? 0;
      cur = cur.parent;
    }
  }

  let opener: GoFishNode | undefined;
  let openerScope: FlipScope | undefined;
  for (const child of children) {
    const operand =
      child instanceof GoFishRef
        ? child.targetNode
        : child instanceof GoFishNode
          ? child
          : undefined;
    if (operand === undefined) return undefined;
    // Path from the common ancestor down to the operand (exclusive of the
    // ancestor, inclusive of the operand).
    const path: GoFishNode[] = [];
    let ca: GoFishNode | undefined;
    for (let cur: GoFishNode | undefined = operand; cur; cur = cur.parent) {
      if (frameTy.has(cur)) {
        ca = cur;
        break;
      }
      path.push(cur);
    }
    if (ca === undefined) return undefined;
    // Walk top-down; the TOPMOST opener on the path is the operand's scope
    // (the same first-opener-wins rule as the main walk).
    let ty = frameTy.get(ca)!;
    let found: GoFishNode | undefined;
    let foundTy = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i];
      ty += n.projectedTranslate(1) ?? 0;
      if (opensFlipScope(n)) {
        found = n;
        foundTy = ty;
        break;
      }
    }
    if (found === undefined) return undefined; // an unflipped operand → keep today's behavior
    if (opener === undefined) {
      opener = found;
      openerScope = found._rootFlipScope ?? scopeBox(found, foundTy);
    } else if (opener !== found) {
      return undefined; // operands span different scopes (#657 deferral)
    }
  }
  return openerScope;
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
    let nodeFlip = resolveNodeFlip(node, composedTranslate[1], incomingFlip);
    // A relational connector with no scope of its own adopts its operands'
    // unique scope (#657 single-scope case — see `connectOperandFlip`).
    if (
      nodeFlip === undefined &&
      node instanceof GoFishNode &&
      (node as { type?: string }).type === "connect"
    ) {
      nodeFlip = connectOperandFlip(node, composedTranslate[1]);
    }

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

/**
 * Flatten a node's CHILDREN into absolute-transform `DisplayObject`s at an
 * already-composed `translate`/`scale`, with no flip-scope tracking — the
 * shared body for a translate-only barrier (a `box`/`layer` coordinate-
 * transform barrier) whose content does not itself open a y-up scope. The
 * boundary lowers each returned entry at its baked absolute transform (via
 * `INTERNAL_lower(coord, d.transform)`) — the same mechanism the root bake
 * uses for a plain (non-flip-scope) descent — so a translate-only boundary
 * needs no per-container `toPixel` closure (#39 stage 6d). z-order is
 * resolved identically to {@link bake} via the shared
 * {@link orderChildrenForPaint}, just without a flip payload threaded
 * through the hoist.
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

    for (const { node: child, accTranslate } of orderChildrenForPaint(n)) {
      walkNode(
        child,
        [
          composedTranslate[0] + accTranslate[0],
          composedTranslate[1] + accTranslate[1],
        ],
        composedScale
      );
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
  for (const { node: child, accTranslate } of orderChildrenForPaint(node)) {
    walkNode(
      child,
      [translate[0] + accTranslate[0], translate[1] + accTranslate[1]],
      scale
    );
  }
  return items;
};
