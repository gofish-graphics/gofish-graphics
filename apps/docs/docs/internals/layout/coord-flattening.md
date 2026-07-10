---
title: Flattening the Scenegraph
section: Layout & Rendering
order: 51
group: Layout
status: draft
covers:
  - packages/gofish-graphics/src/ast/coordinateTransforms/coord.tsx
  - packages/gofish-graphics/src/ast/coordinateTransforms/bake.ts
  - packages/gofish-graphics/src/ast/paintOrder.ts
---

# Flattening the Scenegraph

The `coord` operator wraps a subtree in a non-Cartesian coordinate system — polar,
clock, wavy, and friends. To make that work, `coord` does something the rest of the
layout pipeline never does: it **collapses its entire child hierarchy into a flat
list**. This page explains why, and how `flattenLayout` does it.

## Why flatten at all?

Everywhere else in GoFish, structure is meaningful. A `stackX` places its children
_relative to each other_; a frame offsets its child _relative to itself_. Position is
expressed as a chain of nested, relative transforms.

A coordinate transform breaks that model. Mapping a point into polar space is a
function of its **absolute** position — its final `(x, y)` in the coordinate plane —
not of where it happens to sit in the operator tree. A rectangle two stacks deep and a
rectangle at the top level are mapped by exactly the same rule. The graphical operators
that produced those positions are, at this point, irrelevant: their _only_ job was to
decide final positions, and they have finished.

So before `coord` can apply its transform, it needs every descendant expressed in one
shared, absolute frame. That is what flattening produces.

::: gofish example:internal-scenegraph-flatten hidden
:::

Each leaf in the flattened list carries the **sum** of every `translate` and the
**product** of every `scale` on the path from `coord` down to it. The intermediate
`stackX` / `stackY` nodes are gone.

## How `flattenLayout` works

`flattenLayout` is an ordinary depth-first recursion that threads two accumulators —
a cumulative translation and a cumulative scale — down the tree:

```ts twoslash
type Transform = { translate?: [number, number]; scale?: [number, number] };
// ---cut---
// Going down one level: add this node's translation, multiply its scale.
function descend(
  parent: [number, number],
  parentScale: [number, number],
  node: Transform
): { translate: [number, number]; scale: [number, number] } {
  return {
    translate: [
      parent[0] + (node.translate?.[0] ?? 0),
      parent[1] + (node.translate?.[1] ?? 0),
    ],
    scale: [
      parentScale[0] * (node.scale?.[0] ?? 1),
      parentScale[1] * (node.scale?.[1] ?? 1),
    ],
  };
}
```

When the recursion reaches a **leaf**, it writes the accumulated transform back onto
the node and returns it as a one-element list. A node counts as a leaf when it has no
children — or when it is a `connect` or `box` node, which are deliberately treated as
opaque (see the caveats below). Internal nodes `flatMap` the recursion over their
children, so the whole tree bottoms out into a single flat array.

The recursion does **not** visit children in raw array order — it orders them first
with the very same paint-order rule the root bake uses (`orderChildrenForPaint` in
`paintOrder.ts`): a `(zOrder, index)` sort, or a `topoSortByZOrder` over the layer's
`zAbove` / `zBelow` constraints. This is what makes `zOrder(-1)` (and z constraints)
take effect **inside** a coordinate transform. It was left out for a long time — the
coord-local flatten walked children in array order, so a gotree link's `.zOrder(-1)`
(links-under-nodes) was silently a no-op under `coord: polar()`
([#676](https://github.com/gofish-graphics/gofish-graphics/issues/676)). Ordering is
LOCAL to each layer, exactly as in the root bake (below); only the leaf/boundary rules
differ between the two flatteners.

Two design notes from the source worth knowing:

- **Translation undefined ≠ translation zero.** Flattening reads `translate?.[0] ?? 0`,
  but that `?? 0` is local to this accumulation. Elsewhere in layout, an _undefined_
  translate is a meaningful signal ("my parent may still place me"). Don't conflate the
  two.
- **`coord` runs the recursion at render time.** `coord` keeps its children for the
  layout pass, then calls `flattenLayout` inside `render` to produce the flat list it
  actually draws, applying the coordinate transform to each flattened leaf.

## The root bake — flattening the _whole_ tree

`flattenLayout` is the **coord-local** flattener: `coord` calls it on its own
subtree. There is also a **root** flattener, `bake`, in the same file, which is what
render now consumes for the _entire_ chart (replacing the old nested `<g transform>`
recursion). `bake` flattens the whole scenegraph into one ordered list of
`DisplayObject`s — each a `{ node, transform }` draw entry at an absolute transform —
which the render entry maps over directly.

`bake` differs from `flattenLayout` in two ways:

- **Boundaries.** A node whose render is _not_ reducible to "translate its independent
  children" is a **bake boundary**: it emits a single `DisplayObject` and renders its
  own subtree internally. These are the space-remappers (`coord`), the compositors
  (`over` / `atop` / `in` / `out` / `xor` / `mask`), and the cross-child self-drawers
  (`connect` / `arrow` / `enclose` / `box`), plus any label-bearing node. So `coord`
  stays a boundary — `bake` never recurses _through_ a coordinate transform (which
  would compose a single global translate across a space remap); `coord` keeps doing
  its own coord-local `flattenLayout` inside. The bake is **boundary-recursive**. (The
  boundary set is a string set today; replacing it with a node-declared flag is tracked
  in [#75](https://github.com/gofish-graphics/gofish-graphics/issues/75).)
- **Draw order.** Paint order is resolved **hierarchically** — per transparent layer,
  over its component-granular children — exactly as the legacy `layer` render did, NOT
  by one global sort. This is load-bearing: a `zOrder(-1)` (or a `zAbove` / `zBelow`
  constraint) is **local** to its layer — it orders a child behind its _siblings_, not
  behind the whole chart. A global flatten would regroup, e.g., all connectors before
  all marks across sibling layers (the pulley diagram and the connected-scatter line
  both broke this way, [#607](https://github.com/gofish-graphics/gofish-graphics/issues/607)).
  So at each transparent layer `bake` orders its children with the same
  `paintOrder.ts` helpers `layer` uses — `flattenForZOrder` (which keeps components
  whole and hoists only plain nested layers) then a `(zOrder, index)` sort or a
  `topoSortByZOrder` over its own `zAbove` / `zBelow` constraints — and only then
  descends into each unit, so a component keeps its internal order. Transforms still
  compose all the way to the leaves; only the _ordering_ is per-layer. This ordering
  is the shared `orderChildrenForPaint` helper — the coord-local `flattenLayout` calls
  the exact same function, so draw order is resolved identically inside and outside a
  coordinate transform (one rule, not two copies).

**`bakeChildren` — the same flatten, reused by boundaries.** `bake`'s per-transparent-layer
children-flatten (the z-order resolution + transform composition) is factored into an
exported `bakeChildren(node, translate, scale)`. A pure translate-only boundary
(`box`/`frame`, `offset`, `enclose`) calls it on its _own_ subtree, seeded at the
boundary's absolute translate, and lowers each returned entry at its baked absolute
transform. This is stage 6d of [#39](https://github.com/gofish-graphics/gofish-graphics/issues/39):
a translate-only boundary no longer composes its translate into a `toPixel` closure and
lower its children parent-relative — it bakes them to absolute coordinates through the
exact z-order-preserving path the root uses, so the two mechanisms can't drift. Only a
non-identity `scale` (which a flat list can't fold) still needs a `group` wrapper.

This root bake is the first step toward a serializable [display
list](/internals/core/rendering) (the render IR): once each draw entry is a
self-contained primitive rather than a `{ node, transform }` back-reference, the flat
list _is_ the display list.

## Tagging each entry with its flip scope (#629)

The bake also decides **y-orientation per subtree** (issue #629). `bake(root, ambientFlip)`
carries a `FlipScope` — the placed y-band `{ baseY, height }` a draw entry mirrors about —
down the walk, and stamps it on each emitted `DisplayObject` as `d.flip`. The lower driver
builds that entry's `toPixel` from it (`toPixelFor(d.flip)`), so a continuous-y chart grows
up while an ordinal-y neighbor stays y-down — see [Rendering](/internals/core/rendering) for
the map itself.

The decision is one rule, `resolveNodeFlip(node, composedTy, incomingFlip)`:

- If a scope is already active (`incomingFlip !== undefined`), **inherit** it. The first
  scope on a root-to-leaf path wins; descendants never re-open (no double flip).
- Otherwise a node **opens** a scope about its own placed band (`scopeBox`, or the
  authoritative `contentNode._rootFlipScope` for the root plot) iff its own resolved y is
  CONTINUOUS (`declaredYUp`) or it is a `coord`. An ORDINAL / UNDEFINED node declares
  nothing. `declaredYUp` reads only the node's reported underlying space — it briefly
  carried a fallback to a privately stashed space so normalize-spine mosaics could open
  a flip scope, but normalized stacks now report real continuous `[0,1]` share spaces
  (see [Underlying Space](/internals/core/underlying-space)), so the fallback is gone.
- `_scopeTransparent` chrome wrappers never open (their bbox is the wrong band); an
  `_ambientYDown` chrome subtree renders in the ambient frame and is **box-mirrored** about
  the plot's frame — stamped directly on the chrome nodes by `layout()` as `_chromeFrame`
  (no walk-time search).

Two places had to run this **same** rule so a subtree's orientation is stable no matter how
it is wrapped:

- **The z-order hoist.** The z-order flatten is `flattenForZOrder` with a `fold` payload that
  _carries the flip scope through each hoisted-through plain layer_, so adding a `zAbove` /
  `zBelow` constraint can never change which scope a subtree lowers under. (One walk, not a
  forked copy — the fold is threaded through the single `paintOrder.ts` helper.)
- **Bake boundaries.** A boundary whose own y space is UNDEFINED (`enclose` / `arrow` /
  `connect`) would otherwise lower its whole subtree under a single (y-down) map. Instead its
  child descent (`lowerChildrenOffset`) **re-runs `bake`** on each child — seeded with the
  boundary's absolute translate (`startTransform`) and its own flip scope (`startFlip`) — and
  lowers each leaf under that leaf's own scope's `toPixel`. So a continuous-y bar chart inside
  an `enclose` still flips, while an ordinal neighbor beside it stays y-down. Single-orientation
  content inherits the boundary's flip and lowers byte-identically to the old single-map descent.
  (A connector spanning _two different_ scopes is a known gap —
  [#657](https://github.com/gofish-graphics/gofish-graphics/issues/657).)

## Fitting the subtree to the coordinate budget

`coord.layout` is a **scale scope**, exactly like the root fits content to the
canvas (gofish.tsx) — here the angular/radial budget plays the canvas role. Its
`fitAxis(axis, budget)` reads the subtree's resolved space on that axis and
returns a `(scaleFactor, posScale)` to hand each child: a baseline-magnitude
(data SIZE) axis scales by `width.inverse(budget)` so the children fill the ring;
an anchored (data POSITION) axis maps onto `[0, budget]` via a posScale and
carries **no** size σ (Stage 6c — a POSITION-only axis has no SIZE scope, so it
never fabricates one; the map's own slope is the scope's σ). Only
DATA-bound channels consume these — a plain number bypasses both (see
`computeAesthetic`) — so a hand-sized (radian/pixel) mark is unaffected, while a
mark that says `thetaSize: datum(count)` auto-fits. Because the coord is the
single σ-scale-root, an intermediate `distribute`/`nest` under it must NOT
re-root (it propagates the inherited σ — see the scale-root scoping gate in
`buildChildScalePlan`); this is what makes a flat distribute confluent with any
nested grouping of the same data-driven children (see
[Layout & Render Passes](/internals/layout/passes)).

## Current limitations

`flattenLayout` is still evolving. The source carries TODOs, and the surrounding
`coord` layout still carries some polar-specific assumptions. The angular extent is no
longer the bare `2π` literal it once was: `coord.layout` reads the **angular budget**
from the transform's `domain[0].size` (so `polar({ centralAngle })` gives a partial fan)
and insets the radial range by the transform's **`innerRadius`** (a donut hole as a
fraction of the outer radius), building an `effectiveTransform` that shifts `r` by the
inner radius; the axis/grid renderers read the same budget instead of `2π`. What remains
polar-shaped is the assumption that axis 0 is angular and axis 1 radial. The
`connect`-as-leaf
rule is explicitly called a hack: `connect` is excluded from flattening so it can keep
rendering in coordinate space, where a cleaner design would have `connect` emit a child
path mark instead. Treat this page as describing the _intended_ model — expect the
exact leaf rules to shift as the non-Cartesian coordinate work matures.

See [Layout & Render Passes](/internals/layout/passes) for how `coord` fits into the
larger pipeline, and [Authoring Coordinate Transforms](/internals/layout/coordinate-transforms)
for the transform interface itself.
