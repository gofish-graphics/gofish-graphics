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
opaque (see the caveats below). Internal nodes simply `flatMap` the recursion over
their children, so the whole tree bottoms out into a single flat array.

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
  compose all the way to the leaves; only the _ordering_ is per-layer.

This root bake is the first step toward a serializable [display
list](/internals/core/rendering) (the render IR): once each draw entry is a
self-contained primitive rather than a `{ node, transform }` back-reference, the flat
list _is_ the display list.

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
