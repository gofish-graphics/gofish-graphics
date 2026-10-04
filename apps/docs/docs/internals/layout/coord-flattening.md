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
children — or when it is a relational node (`connect`, `tween`) or a `box` node, which
are deliberately treated as opaque (see the caveats below). Internal nodes `flatMap` the recursion over their
children, so the whole tree bottoms out into a single flat array.

The recursion does **not** visit children in raw array order — it orders them first
with the very same paint-order rule the root bake uses (`orderChildrenForPaint` in
`paintOrder.ts`). This is what makes `zOrder(-1)` (and z constraints) take effect
**inside** a coordinate transform. It was left out for a long time — the coord-local
flatten walked children in array order, so a gotree link's `.zOrder(-1)`
(links-under-nodes) was silently a no-op under `coord: polar()`
([#676](https://github.com/gofish-graphics/gofish-graphics/issues/676)). Ordering is
LOCAL to each layer, exactly as in the root bake (below); only the leaf/boundary rules
differ between the two flatteners.

### How a layer orders its children

`orderChildrenForPaint` orders only a node's **direct** children. It never reaches into
a grandchild: each walk recurses one node at a time, and the child orders its own
children when the walk gets there. Without constraints, children paint in `(zOrder,
index)` order, so a numeric `.zOrder(n)` compares a child only with its siblings.

A `zAbove(a, b)` / `zBelow(a, b)` constraint declared at a layer L becomes an edge
between two children. It is resolved once, when L orders its own children, and before
any of L's descendants is ordered. Every node inside L that carries the name `a` or
`b` is an operand. For each pair of operands, the resolution follows the two paths
down from L to the node where they part, and records an edge between that node's two
children that hold them. If the operands lie in different children of L, the edge is
between those two children of L, each ordered as a whole. If they lie in the same
child, the constraint is pushed down to the node below where they part. A name that
names a child itself means that whole child.

The node where two operands part can be any node, not only a plain layer: a `coord`,
an `enclose`, an `arrow`, or a `box` layer. So every place that paints a node's
children gets their order from `orderChildrenForPaint`, never from the raw children
array: the bake walks, `coord`'s own lowering, `lowerChildrenOffset` (behind `enclose`,
`offset` and `arrow`), and `bakeChildren` (behind `box`). A constraint pushed down into
any of them takes effect there, and a boundary that declares its own constraints (a
`box` layer's `.relate()`) resolves them when it orders its children. Before
[#982](https://github.com/gofish-graphics/gofish-graphics/issues/982) settled this, a
`coord` or `enclose` lowered its children in array order, and a constraint that parted
inside one did nothing.

The compositors (`over` / `atop` / `in` / `out` / `xor` / `mask`) are the one
exception, and the operator defines it. A compositor paints one result combined from
its first child (the source, or the mask) and its second (the destination, or the
content), so the index of a child names its role, and there is no paint order between
the two to change. A compositor calls `assertNoPaintOrder` instead, which resolves the
compositor's own constraints and throws, naming the constraints, if any z constraint
parts at it. The relational nodes (`connect`, `tween`) paint none of their children
(their children are refs, which draw nothing), so they never ask for an order.

Names are looked up with the same rule as every other name: through any node that is
not a component, and never into a `createMark` component (see
[Names and scoping](/internals/core/names-and-scoping)). So an operand inside a
`spread` or a `box` layer is found, and a constraint never reaches past the nearest
component around L.

This holds for a user's `zAbove` / `zBelow` and for the relational-mark default
(`zBelow(connector, operand)` in `layer.tsx`). The default names the operand itself,
so the connector paints under whichever child of the layer holds the operand, and a
nested chart's own relational line stays under its own dots, since that constraint is
declared on the nested chart and orders only its children.

Because a child paints as a whole, one child can no longer paint between two marks of
another. Asking for that, for example `zBelow(a, x)` and `zBelow(x, b)` with `a` and
`b` in one child and `x` in another, gives two edges in opposite directions, and the
sort throws an error that names both constraints. The fix is to make the marks that
interleave siblings, as the pulley diagram does with its ropes and wheels.

The sort itself is Kahn's algorithm. It repeatedly emits the smallest child that has
no unsatisfied edge left pointing at it, where "smallest" means lowest `(zOrder,
index)`. Ordering the unconstrained majority by `(zOrder, index)` is what makes the
result identical to the plain sort when there are no constraints at all.

The ready set is a binary min-heap, because a layer can hold tens of thousands of
children, and a re-sorted array would be quadratic in the number of children. The
heap makes the sort `O(n log n + edges)`.

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
  (`connect` / `tween` / `arrow` / `enclose` / `box`), plus any label-bearing node. So `coord`
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
  So at each transparent node `bake` orders its direct children with
  `orderChildrenForPaint` (described above) and only then descends into each child,
  which orders its own children in turn. Transforms still compose all the way to the
  leaves; only the _ordering_ is per-layer. This ordering
  is the shared `orderChildrenForPaint` helper — the coord-local `flattenLayout` calls
  the exact same function, so draw order is resolved identically inside and outside a
  coordinate transform (one rule, not two copies).

**`bakeChildren` — the same flatten, reused by boundaries.** `bake`'s per-transparent-layer
children-flatten (the z-order resolution + transform composition) is factored into an
exported `bakeChildren(node, translate, scale)`. A pure translate-only boundary
(`box`/`frame`) calls it on its _own_ subtree, seeded at the
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
- **Fixed-pitch exception.** A target chained by a fixed-pitch `distribute` on y
  (`anchor: "baseline" | "start" | "middle" | "end"`) carries `pitchAnchorY` — the anchor the
  chain related, stamped by `lowerDistributePlacement`. A fixed-pitch chain is an **overlay**,
  not a tiling: the target's allocated band is just the leftover slice (`(h − (n−1)·pitch)/n`)
  and bears no relation to where its chained anchor sits, so mirroring about it would displace
  every painted anchor by the slice height (and a connector reading the same rows from outside
  the scope by a _different_ amount — the ridgeline-wobble bug). Such a scope instead mirrors
  about the chained anchor itself, a degenerate height-0 band: `y ↦ 2·anchor − y`, the unique
  mirror that **fixes the chained anchor pointwise**. Painted anchors therefore sit exactly
  where the placement solver chained them, at exact pitch, and content rises above its
  baseline (a ridgeline row's silhouette grows up from its own zero line). The layout side
  accounts for that painted extent too: the space fold attributes the chain's amplitude
  allowance to the painted side (`chainClaim` in constraints/distribute.ts), the enclosing
  layer folds each such row's MIRRORED band into its bbox (`paintedYBand` in layer.tsx),
  and `render()` attributes y overhangs by painted side (an unflipped root's negative min
  is the painted TOP), so the resulting negative min is reserved as a painted-TOP gutter —
  the first baseline sits an allowance below the box top, the last
  baseline lands at the box bottom with the x axis directly beneath it, and no story-side
  padding is needed. See [Underlying Space](/internals/core/underlying-space) for the
  per-anchor allowance formulas.

The walk visits every node on the way down, including each plain layer, so every node
decides its scope with this one rule. Adding a `zAbove` / `zBelow` constraint only
reorders a layer's children; it cannot change which scope a subtree lowers under.

Two other places have to run the **same** rule so a subtree's orientation is stable no
matter how it is wrapped:

- **Bake boundaries.** A boundary whose own y space is UNDEFINED (`enclose` / `arrow` /
  `connect`) would otherwise lower its whole subtree under a single (y-down) map. Instead its
  child descent (`lowerChildrenOffset`) **re-runs `bake`** on each child — seeded with the
  boundary's absolute translate (`startTransform`) and its own flip scope (`startFlip`) — and
  lowers each leaf under that leaf's own scope's `toPixel`. So a continuous-y bar chart inside
  an `enclose` still flips, while an ordinal neighbor beside it stays y-down. Single-orientation
  content inherits the boundary's flip and lowers byte-identically to the old single-map descent.
- **Relational nodes adopt their operands' scope.** A `connect` (the node behind
  `line`/`ribbon`) or a `tween` (the node behind `time.transition()`) paints its
  _operands'_ geometry, but it lives as a sibling tier outside
  their subtrees — so when no scope is active at its own altitude it used to lower unflipped
  even though its operands mirror inside their own scopes (per-row scopes under a fixed-pitch
  distribute), drawing the band upside-down and displaced. `relationalOperandFlip` handles the
  **single-scope case**: when every operand lowers under the same scope (reconstructed by
  re-running the scope decision along each operand's ancestor path below its common ancestor
  with the connector), the connector adopts it. Operands under _different_ scopes (or none)
  keep the old behavior — that multi-scope reconciliation is still the known gap
  ([#657](https://github.com/gofish-graphics/gofish-graphics/issues/657)).
  A `tween` that moves a text leaf (a keyframe mark's label) lowers each
  keyframe's text once, under the tween's own adopted scope, and then only
  shifts it, so the label and its bar are drawn under the same map.

## Fitting the subtree to the coordinate budget

`coord.layout` is a **scale scope**, exactly like the root fits content to the
canvas (gofish.tsx) — here the angular/radial budget plays the canvas role. Its
`fitAxis(axis, budget)` solves the coord's own scope on that axis with the
same `solveScope` the root uses: σ from the coord's claim (its children's
claims overlaid, or a declared window's width) against the budget, so the
children fill the ring, and, for a pinned axis, the map onto the budget that
its children share. A free child is seated at the scope's `originPx`. The
coord's type is its children's overlay, kept for its own scope; upward it
reports nothing on either axis, like every σ-scope root: to its parent it is a
pixel box, and an explicit `w`/`h` sizes that box as it sizes a layer's (a
`Frame` with a `coord` forwards its dims, #535). So its axes are its own to draw, and so are their titles: the
radial axis is drawn along the θ = 0 ray, and its title continues the ray
past its outer end (past the last tick), reading along the ray, so it never
sits on top of the data. The title is the `axes` option's `y` title,
else the radial space's measure, else the space's own name for the axis (`r`)
(#621). There is deliberately no angular title by default: the ring's tick
labels say what goes around, and a circle has no single natural place for a
title. The chart-level title pass reads only the root's own space, so it adds
no second title for a coordinate space. Only
DATA-bound channels consume these — a plain number bypasses both (see
`computeAesthetic`) — so a hand-sized (radian/pixel) mark is unaffected, while a
mark that says `w: datum(count)` (the θ extent) auto-fits. Because the coord is the
single σ-scale-root, an intermediate `distribute`/`nest` under it must NOT
re-root (it propagates the inherited σ — see the scale-root scoping gate in
`buildChildScalePlan`); this is what makes a flat distribute confluent with any
nested grouping of the same data-driven children (see
[Layout & Render Passes](/internals/layout/passes)).

## Two budget rules: polar, and a space that lays out in data units

The paragraph above describes the polar family, where the budget is synthetic:
radians on one axis and pixels of radius on the other, with the data mapped onto
it. A `geo` space is not like that. Its coordinate units _are_ its data units —
degrees — so the map a child sees has to be the identity in degrees, with no
nicing, no zero included and no padding.

Rather than special-case that, a transform may supply two things:

- **`dataWindow`** — a data interval per axis that REPLACES the union of the
  children's POSITION domains in `coord.resolveUnderlyingSpace`. A window is the
  frame the author asked for, not a summary of what happens to be inside it. It
  is only ever read as that window: whether a space frames itself is `fit`'s
  business, never `dataWindow`'s presence (see below).
- **`fit`** — given the coord's pixel allocation, its padding and the resolved
  window, it returns the budget the children lay out in, the transform from that
  budget to pixels, and the window's EXTENT in pixels under that transform.
  `geo`'s returns the window's span in degrees, and a transform that projects
  `windowMin + u` and scales the projected extent into the box with ONE factor,
  so the map keeps its aspect ratio. The extent is the measurement that factor
  came from, handed back rather than recomputed: `fit` measures the window on a
  24x24 lattice, because a projection curves in both axes and an extremum can sit
  strictly inside the window (Equal Earth is widest at the equator), which the
  boundary-only sampler `computeTransformedBoundingBox` uses by default would
  miss. Measuring the same window twice with two samplers gave two answers, and
  the framed box below was the smaller one.

The identity-in-degrees scale then falls out of the existing machinery rather
than being asserted: `fitAxis` maps the resolved domain (the window) onto
`[0, budget]`, and the window's width IS the budget, so the slope is 1. A coord
scope never nices (see `niceContinuous`), so nothing rounds the domain either.

A transform with a `fit` is also **framed**, and `fit !== undefined` is the ONE
test for that — used by the budget rule, by the box, and by the culling frame
alike, so the three cannot drift apart. Its box is the window's projected
extent — the `extent` its own `fit` reported — instead of the union of what its
children drew (so `layout` skips the per-child screen-bbox accumulation it would
throw away), and `lower` skips any
flattened item whose coordinate-space box lies wholly outside the budget — so a
chart of the Americas is not silently zoomed out to fit Asia. An item only
partly outside is still drawn whole and hangs over the frame; cutting it would
need a polygon clipper, which does not exist yet.

`layout` stashes the transform it resolved (the donut-hole shift, or the fitted
map) in a closure ref that `lower` reads, because a fitted map is a closure and
cannot ride `renderData` as the old `innerRadius` number did. `geo` memoizes its
`fit` on the pixel box, the padding and the window, so a re-render at the same
size hands back the SAME closure instead of a fresh one per frame.

The axis and grid overlays `coord.lower` draws are the polar family's: they read
`domain` as (theta, r) and tile ticks across the angular budget. Under a fitted
space those would draw rings at 2π radians of longitude, so `lower` throws there
instead — a geo graticule is its own piece of work.

## Current limitations

`flattenLayout` is still evolving. The source carries TODOs, and the surrounding
`coord` layout still carries some polar-specific assumptions. The angular extent is no
longer the bare `2π` literal it once was: `coord.layout` reads the **angular budget**
from the transform's `domain[0].size` (so `polar({ centralAngle })` gives a partial fan)
and insets the radial range by the transform's **`innerRadius`** (a donut hole as a
fraction of the outer radius), building an `effectiveTransform` that shifts `r` by the
inner radius; the axis/grid renderers read the same budget instead of `2π`. What remains
polar-shaped is the assumption, in the no-`fit` branch and in the axis and grid
renderers, that axis 0 is angular and axis 1 radial. The
`connect`-as-leaf
rule is explicitly called a hack: `connect` is excluded from flattening so it can keep
rendering in coordinate space, where a cleaner design would have `connect` emit a child
path mark instead. Treat this page as describing the _intended_ model — expect the
exact leaf rules to shift as the non-Cartesian coordinate work matures.

See [Layout & Render Passes](/internals/layout/passes) for how `coord` fits into the
larger pipeline, and [Authoring Coordinate Transforms](/internals/layout/coordinate-transforms)
for the transform interface itself.
