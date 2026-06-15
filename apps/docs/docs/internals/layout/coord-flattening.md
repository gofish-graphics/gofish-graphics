---
title: Flattening the Scenegraph
section: Layout & Rendering
order: 51
group: Layout
status: draft
covers:
  - packages/gofish-graphics/src/ast/coordinateTransforms/coord.tsx
  - packages/gofish-graphics/src/ast/coordinateTransforms/bake.ts
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

## Current limitations

`flattenLayout` is still evolving. The source carries TODOs, and the surrounding
`coord` layout currently hard-codes assumptions that only hold for the polar case
(for example, the layout size is rewritten to `[2π, radius]`). The `connect`-as-leaf
rule is explicitly called a hack: `connect` is excluded from flattening so it can keep
rendering in coordinate space, where a cleaner design would have `connect` emit a child
path mark instead. Treat this page as describing the _intended_ model — expect the
exact leaf rules to shift as the non-Cartesian coordinate work matures.

See [Layout & Render Passes](/internals/layout/passes) for how `coord` fits into the
larger pipeline, and [Authoring Coordinate Transforms](/internals/layout/coordinate-transforms)
for the transform interface itself.
