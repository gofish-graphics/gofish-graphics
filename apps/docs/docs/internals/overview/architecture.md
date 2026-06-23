---
title: Architecture Overview
section: Overview
order: 10
status: draft
covers:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/_node.ts
---

# Architecture Overview

This is the map. It sketches how a GoFish chart goes from a declarative description to
an SVG, and points at the essays that cover each part in depth.

## A chart is a tree

GoFish is **declarative**: you never tell it to draw — you describe _what_ the chart is,
and the engine works out the rest. That description is an **abstract syntax tree** of
`GoFishNode`s. Two kinds of node make up the tree:

- **Marks** — the things you can see: `rect`, `ellipse`, `line`, `area`, `text`.
- **Graphical operators** — composition: `stackX`, `spread`, `layer`, `connect`,
  `coord`, and so on. An operator arranges its children; it has no appearance of its own.

The [fluent frontend](/internals/frontend/pipeline-syntax) —
`chart(data).flow(...).mark(...)` — is sugar. It
[desugars](/internals/frontend/pipeline-syntax) into exactly this tree, built
from the [mark](/internals/frontend/mark-factory) and
[operator](/internals/frontend/operator-factory) factories.

## Three passes

Rendering the tree is not one traversal but three, each answering a different question.
A node implements only the passes it participates in.

::: gofish example:internal-render-pipeline hidden
:::

**1 · Domain inference.** Before anything can be sized, the engine works out the data
ranges in play — the _domains_. GoFish distinguishes a node's
[underlying space](/internals/core/underlying-space) (is this dimension
continuous, ordinal, or undefined? — and if continuous, is it a _position_, a
_size_, or a _difference_, which since #586 are the three `origin` states of one
continuous kind) and infers position and size domains separately. This
pass leans on the [monotonic algebra](/internals/core/monotonic) to track, symbolically,
how each subtree depends on the data — and to prune subtrees that don't depend on it
at all.

**2 · Layout.** With domains known, each node computes its size. Layout dispatches on
the continuous space's `origin` state: a `SIZE` (free) dimension resolves through the
monotonic machinery, a `POSITION` (anchored) dimension through position scales. Bounding boxes
([the bbox model](/internals/core/bbox)) are the common currency.

**3 · Placement & render.** Final absolute positions are assigned, and each node emits
SVG. Rendering is reactive — it runs through **SolidJS** — so a chart can update without
a full rebuild. The [`coord` operator](/internals/layout/coord-flattening) is the
notable special case: it flattens its subtree into a flat, absolutely-positioned list
before applying its coordinate transform. A coordinate transform is parameterized
(`polar()`/`clock()` take `innerRadius`/`centralAngle`/`startAngle`/…) and may declare
**axis-name aliases** (`theta`/`r`); a small top-down pass before layout resolves those
aliases into the canonical `x`/`y`/`w`/`h` facets (see
[Pass 5.5](/internals/layout/passes#pass-5-5-coordinate-space-alias-resolution)).

The placement pass treats every real node as a `Placeable`: it can expose its
dimensions, accept final placement pins, report whether an axis is already
data-positioned, and answer where a local anchor (`min`, `center`, `max`, or
`baseline`) sits inside its own box. That `localAnchor` method is what lets the
constraint solver express alignment and distribution as equations over sibling
boxes rather than as order-sensitive imperative writes.

**Chrome is just more tree.** Axes, legends, and axis titles are not privileged
render-time fixtures. Before layout, elaboration passes rewrite each of them into
ordinary marks and constraints — `Layer`-wrapped `Rect`/`Text` nodes seated by
`align`/`distribute`/`position` — so chrome flows through the same three passes
as the data marks. Each axis names itself off its own resolved underlying
space's **measure** (a continuous axis by its unit, an ordinal axis by its
grouping field), so an axis title is derived from the data model, not a
syntactic hint. The orchestrator (`gofish.tsx`) then sizes the SVG off the
laid-out tree's **measured extent on all four sides** — the legend's overhang
past the content, the axis/title gutters past the origin, and any content a
constraint seated beyond the canvas (a marginal histogram's bands above and to
the right of a scatter); there are no fixed chrome margins. See
[Axes](/internals/frontend/axes) (which also covers axis titles) and
[Legends](/internals/frontend/legends).

The full, code-level walkthrough of all three passes is
[Layout & Render Passes](/internals/layout/passes).

## Cross-cutting machinery

A few systems thread through every pass rather than belonging to one:

- **Contexts.** [`scopeContext`, `scaleContext`, `keyContext`](/internals/core/contexts)
  carry variable scoping, color/axis scales, and named-element tracking down the tree.
- **Coordinate transforms.** `linear`, `polar`, `bipolar`, `wavy`, `clock` — pluggable
  mappings from one plane to another, applied during render.
- **Names & scoping.** Marks can be `name`d and referenced across charts via `ref(name)` (one node) or `selectAll(name)` (many);
  scoping is deliberately hygienic.

## Where to go next

- New to the layout model? Read [Layout & Render Passes](/internals/layout/passes).
- Curious about the type-level tricks? [The Monotonic Module](/internals/core/monotonic).
- Want the design philosophy? [Design Philosophy](/internals/design/philosophy).
