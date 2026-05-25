---
title: Shapes vs Derived Marks
section: Speculative Notes
order: 40
status: speculative
---

# Shapes vs Derived Marks

Open design question: are _shapes_ (`rect`, `circle`, `ellipse`, `polygon`,
`text`, ...) and _derived marks_ (`connect`, `arrow`, `enclose`, ...) the
same kind of thing, or different kinds of things that the engine happens to
plumb through the same pipeline?

## The categories today

**Shapes** (`src/ast/shapes/`) — `rect`, `circle`, `ellipse`, `polygon`,
`text`, `image`, `petal`. Each one is _self-sized_: you give it props
(`circle({ r: 25 })`, `text({ text: "x" })`) and it computes its own
intrinsic dimensions from those props. It contributes a bbox up to its
parent layer, which then places it. Channel-bindable
(`rect({ h: "value" })`) for data-driven charts.

**Derived marks** (`src/ast/graphicalOperators/`) — `connect`, `arrow`,
`enclose`. Each one is _ref-driven_: you give it `ref(...)` children, and
its visual is _derived_ from the resolved positions of those refs.
`connect([ref("A"), ref("B")])` draws a line whose endpoints come from
A's and B's bboxes. It has no intrinsic size — its bbox is induced by
its references.

The two move through the same `GoFishAST → resolveUnderlyingSpace →
layout → render` pipeline, but the relationship to that pipeline is
fundamentally different:

|                              | Shape                      | Derived mark                       |
| ---------------------------- | -------------------------- | ---------------------------------- |
| Size source                  | own props                  | bboxes of `ref()` children         |
| Layout precondition          | none (place anytime)       | refs must already be placed        |
| Contributes to parent's bbox | yes                        | yes, but the bbox is _induced_     |
| Channel-bindable             | yes (`rect({h: "value"})`) | no, and unclear what it would mean |
| Common combinator form       | rarely                     | always (it takes children)         |

## Why the asymmetry matters

The layout-precondition row is the load-bearing one. Shapes can sit
anywhere in a `Layer`'s child list; the layer places them however it
likes. Derived marks need their refs _already placed_ before their own
layout can run — they have nothing to compute against otherwise.

That's the whole reason the **nested-tier pattern** exists. The
pulley story ([Pulley.stories.tsx](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-graphics/stories/bluefish/Pulley.stories.tsx))
splits its layer into three tiers:

1. Inner shapes layer — places the wheels, weights, ceiling rect.
2. Outer-tier `connect` marks — read the placed shapes via `ref()`.
3. Outer-tier text labels — placed beside the ropes.

Each tier lays out after the one it depends on. The pattern works because
GoFish's layer-render order matches lexical child order, so tier 2's
derived marks see tier 1's resolved bboxes. Get the order wrong and
`ref("A")` returns nothing useful.

If shapes and derived marks were the same kind of thing, the engine
couldn't notice the difference — and the author has to carry the
ordering discipline manually.

## How we got here

In Bluefish, this distinction was completely flat. `Line`, `Rect`,
`Group`, `Align`, `Distribute` — all `Component`s. `Line` (Bluefish's
`connect` analog) took refs as children and was structurally identical
to `Rect`. The engine ran a single constraint-satisfaction pass that
resolved everything in lockstep, so "refs must be placed first" wasn't
a thing the author needed to know.

GoFish doesn't do full constraint-satisfaction. Its pipeline is
directional (`resolveUnderlyingSpace` → `layout` → `render`), and the
directionality is what introduces the ordering question. We got
predictability (each pass is a tree walk in declared order) at the cost
of needing the author to interleave shapes and ref-consumers in the
right tier.

## What a sharper split could look like

Three rough directions:

1. **Encode the layout-order rule in the type.** A new `DerivedMark`
   class that the layout pipeline recognizes — it gets scheduled _after_
   its sibling `Shape`s have placed, regardless of declaration order.
   Authors stop writing nested-tier scaffolding by hand; the engine
   does it.
2. **Keep the flat structure, lint for misuse.** A dev-mode warning
   when a derived mark's `ref()` resolves to an unplaced sibling
   (instead of crashing later in `layout` with a confusing
   "intrinsicDims undefined"). Cheaper, lower architectural risk.
3. **Push derived marks out of the layer family entirely.** They become
   a separate top-level concept — `Decoration`s or `Annotation`s — that
   live alongside a layout tree but never participate in size/position
   resolution as siblings. Closer to how SVG `<defs>` overlays work.

(1) is the most powerful and the most invasive. (2) is the smallest step
that pays off — the nested-tier pattern would still be the answer, but
the engine helps users discover when they got it wrong. (3) is the
cleanest conceptually but requires rethinking how derived marks
contribute to their parent's bbox.

## Open questions

- Where does `polygon` sit? It has explicit local-coord points — fully
  self-sized like a shape. But the points are often expressed in terms
  of other marks' coordinates by the author (you computed them from a
  weight's `width`). Maybe it's a shape that _could_ be derived if we
  let it consume refs.
- Should `ref()` itself be a special kind of node? Right now it's a
  shape-shaped leaf that contributes no visual but does contribute to
  name-scope. The "ref + ref-consumer" pair is what defines derivation.
- The macro-expansion proposal in
  [#144](https://github.com/gofish-graphics/gofish-graphics/issues/144)
  (label as macro) generates _new_ AST nodes — including refs — at
  construction time. That's another derivation mechanism, distinct from
  what `connect` does but plausibly worth unifying.
- See also [[operators-vs-constraints]] for the related question on the
  positioning side; `connect` notably sits in both stories (a derived
  mark _and_ a layout operator with combinator form).
