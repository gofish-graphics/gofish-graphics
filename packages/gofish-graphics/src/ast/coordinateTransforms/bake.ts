// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject, FlipScope } from "../_displayObject";
import type { Transform } from "../dims";
import { GoFishNode } from "../_node";
import { isZOrderConstraint } from "../constraints/zorder";
import { flattenForZOrder, topoSortByZOrder } from "../paintOrder";
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
  const height =
    alloc !== undefined && Number.isFinite(alloc)
      ? alloc
      : (gn?.intrinsicDims?.[1]?.size ?? 0);
  return { baseY: composedTy, height };
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
/** The flip scope the CHROME SIBLINGS of a wrapped plot are box-placed by: the
 *  `_rootFlipScope` stamped on the plot content inside a `_scopeTransparent`
 *  chrome wrapper (looking through nested transparent wrappers — the legend
 *  wrapper wraps the title wrapper wraps the plot). Undefined when the plot
 *  doesn't mirror (ordinal/undefined root y — the stamp is conditional). */
const findChromeFrame = (node: GoFishAST): FlipScope | undefined => {
  if (!(node instanceof GoFishNode)) return undefined;
  for (const c of node.children) {
    if (!(c instanceof GoFishNode)) continue;
    if (c._rootFlipScope) return c._rootFlipScope;
    if (c._scopeTransparent) {
      const s = findChromeFrame(c);
      if (s) return s;
    }
  }
  return undefined;
};

export const bake = (
  root: GoFishAST,
  ambientFlip?: FlipScope
): DisplayObject[] => {
  const items: DisplayObject[] = [];

  const walk = (
    node: GoFishAST,
    transform: [number, number],
    scale: [number, number],
    flip: FlipScope | undefined,
    chromeFrame: FlipScope | undefined
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
    if (ambient && flip === undefined && chromeFrame !== undefined) {
      const dim =
        node instanceof GoFishNode ? node.intrinsicDims?.[1] : undefined;
      const boxTop =
        composedTranslate[1] +
        (dim?.min !== undefined && Number.isFinite(dim.min) ? dim.min : 0);
      const boxH =
        dim?.size !== undefined && Number.isFinite(dim.size) ? dim.size : 0;
      // Mirror the box [boxTop, boxTop+boxH] about the frame's band:
      // y ↦ 2·baseY + height − y, applied to the box as a whole.
      composedTranslate[1] +=
        2 * chromeFrame.baseY + chromeFrame.height - 2 * boxTop - boxH;
    }
    const incomingFlip = ambient ? ambientFlip : flip;

    // y-orientation scope (issue #629). A node opens a y-up flip scope — about its
    // OWN placed band (`scopeBox`) — iff its own resolved y is CONTINUOUS
    // (`declaredYUp`) or it is a `coord` (polar/clock, which fixes its own
    // convention). The scope only opens when none is active yet
    // (`incomingFlip === undefined`): a nested continuous node or a `coord` inside
    // an existing scope INHERITS it — the XOR no-op that prevents a double flip,
    // and what places a nested `coord`'s BOX in its parent's frame (a flower's
    // petals stay pinned to their bar tops; a pie glyph keeps its scatter
    // position) while `coord`'s own transform keeps its interior angular sense. A
    // `coord` at top level opens its own band, so a standalone pie reads y-up.
    // Chrome wrappers (`_scopeTransparent`) union the plot's continuous y but are
    // not the σ-scope; chrome itself (`ambient`) never opens one.
    const isCoord = (node as { type?: string }).type === "coord";
    const scopeTransparent =
      node instanceof GoFishNode && node._scopeTransparent === true;
    const opensScope =
      incomingFlip === undefined &&
      !ambient &&
      (isCoord || (declaredYUp(node) && !scopeTransparent));
    // The ROOT plot content mirrors about the authoritative canvas frame
    // `[0, finalH]` (`_rootFlipScope`, stamped by `layout()` when the content
    // mirrors) — the exact frame the old global flip used, and NOT recoverable
    // from the node's own bbox (which the pin can offset from the canvas origin).
    // A scope opening BELOW the canvas frame (a facet cell, a mixed-dashboard
    // subtree) has no stamp and mirrors about its own band.
    const rootScope =
      node instanceof GoFishNode ? node._rootFlipScope : undefined;
    const nodeFlip: FlipScope | undefined = opensScope
      ? (rootScope ?? scopeBox(node, composedTranslate[1]))
      : incomingFlip;

    // Chrome siblings below a transparent wrapper are box-placed by the plot's
    // frame; once consumed (or once we're inside real content) it doesn't
    // propagate further.
    const childChromeFrame = ambient
      ? undefined
      : scopeTransparent
        ? (findChromeFrame(node) ?? chromeFrame)
        : chromeFrame;

    if (!isTransparent(node)) {
      items.push({
        node,
        transform: { translate: composedTranslate, scale: composedScale },
        flip: nodeFlip,
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
          composedScale,
          nodeFlip,
          childChromeFrame
        );
      }
      return;
    }

    // Plain layer: paint children in (local zOrder, index) order.
    const ordered = children
      .map((child, index) => ({ child, index }))
      .sort((a, b) => zOf(a.child) - zOf(b.child) || a.index - b.index);
    for (const { child } of ordered) {
      walk(child, composedTranslate, composedScale, nodeFlip, childChromeFrame);
    }
  };

  walk(root, [0, 0], [1, 1], ambientFlip, undefined);
  return items;
};
