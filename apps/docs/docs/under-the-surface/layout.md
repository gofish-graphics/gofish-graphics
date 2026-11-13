---
title: How does every node get its size and its place?
label: Layout
order: 4
topics:
  - layout
  - size
  - position
  - claim
  - size request
  - sigma
  - scope
  - share
  - fr
  - constraints
  - solver
  - align
  - distribute
  - ref
  - placement
reads:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/extent.ts
  - packages/gofish-graphics/src/ast/length.ts
  - packages/gofish-graphics/src/ast/solver/pwl.ts
  - packages/gofish-graphics/src/ast/solver/scopes.ts
  - packages/gofish-graphics/src/ast/solver/plan.ts
  - packages/gofish-graphics/src/ast/solver/formula.ts
  - packages/gofish-graphics/src/ast/solver/arith.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/spread.tsx
  - packages/gofish-graphics/src/ast/shapes/rect.tsx
  - packages/gofish-graphics/src/ast/constraints/index.ts
  - packages/gofish-graphics/src/ast/constraints/proposalPlan.ts
  - packages/gofish-graphics/src/ast/constraints/claimPlacement.ts
  - packages/gofish-graphics/src/ast/constraints/placementLowering.ts
  - packages/gofish-graphics/src/ast/constraints/placementSolver.ts
  - packages/gofish-graphics/src/ast/constraints/differenceGraph.ts
  - packages/gofish-graphics/src/ast/axes/autoLabelAngle.ts
  - packages/gofish-graphics/src/util.ts
checked:
  commit: 3e52867e4d31dfe0b02e148c22c225f1d33b5a12
  date: 2026-11-13
cover:
  - figure: fill
    rows: 3
    cols: 5
---

<script setup>
import LayoutFill from "./layout.fill.vue";
</script>

Here is a chart with two stacks of two bars each.

```ts
chart(data)
  .flow(
    spread({ by: "c", dir: "x", spacing: 20 }),
    stack({ by: "g", dir: "y" })
  )
  .mark(rect({ h: "v" }))
  .render(el, { w: 240, h: 200, axes: false });
```

No bar says how wide it is or where it goes. Yet each comes out 110 pixels wide, and the second bar of each stack sits on the first. This chapter is about how layout decides that.

Layout is given the node tree after the axis and label rewrites (see [the pipeline](/under-the-surface/pipeline)), the canvas size from `render`, which may be missing on either axis, and the type of every node on each axis: whether the axis holds numbers or categories, and what range the data covers. It gives back, for every node and each axis, a size in pixels and a position in its parent.

## Ask, solve, hand down, place

A node does not ask for a number of pixels. It asks for a formula in one unknown, written σ (sigma). On an axis that holds numbers, σ is the number of pixels per data unit, so a bar of value 3 asks for 3σ of height. A node with no size, in a row of parts, asks for 1σ: one share. On a category axis σ is the number of pixels per share. Fixed pixels are constants, so the spread above asks for 2σ + 20 of width.

The code calls this request a _claim_ (the type `Extent`). It is measured from data 0, so it has an _ascent_ above data 0 and a _descent_ below, and its _width_ is their sum. Each side is a line in σ, or the largest of a few lines (a piecewise-linear value, `Pwl`).

<LayoutFill />

## The order of steps

1. **Ask, from the leaves up.** `resolveExtent` walks the tree once and keeps each answer. A leaf asks for what its type and size imply. A layer runs its constraints on its children's requests, and asks for the outline of where they land.
2. **Solve at each scope.** A _scope_ is a node whose room is fixed from outside: the root, whose room is the canvas, a node with its own `w` or `h`, a coordinate space, a facet panel, a region cell or a treemap tile. It sets its content's request equal to its room and solves for σ (`ScopeRegistry.fit`). Every other node uses the σ handed down to it. A scope also fixes where data 0 falls, so a value _d_ lands at σ·_d_ + _origin_ pixels. That is how data becomes pixels. At the root, the request is first widened to the shared data range, rounded to nice numbers when an axis is drawn, so bars and ticks agree.
3. **Hand sizes down.** `root.layout` calls each node's `layout` with its room and σ. In a row, a part with no size of its own gets what it asked for plus a share of the leftover room, split by weight (`fr(2)` takes two shares). Any other child is offered the layer's whole room: one with a size keeps it, one without fills it. A leaf turns its request into pixels.
4. **Place, from the leaves up.** A layer places its children after they are all laid out. It runs its constraints, seats any child they left alone at data 0, and takes the outline of its children as its box. The root is placed last (`placeRoot`). A root whose y grows upward has its origin at the bottom of the canvas.

With no canvas size, σ is solved against a default of 400 pixels. Where fixed pixels alone overflow the room, layout warns and solves σ as if they took none.

## Constraints and the solver

`align`, `distribute` and `position` live on a layer and place its children (how `spread` and `stack` become them is in [lowering](/under-the-surface/lowering)). Each becomes facts about anchors: the start, middle, end or baseline of a child's box, one axis at a time.

The solver works per layer and per axis. First it closes sizes: a child pinned at both edges gets its size from them. Then each fact becomes a fixed distance between two children, such as "B starts 20 pixels after A ends". Children joined by distances move as one group. A pin fixes a group. A group with no pin puts its shared baseline at data 0; failing that, a row starts at its first part, and anything else puts its lowest edge at 0.

The solver runs once, in the asking step, in formulas: σ and whatever only layout can measure (a laid box, where a self-placed child landed) are inputs. Layout plugs in the solved σ and the measured inputs (`evaluate`) and writes the places back. It does not solve again. If two constraints put one child in two places, layout throws a placement conflict.

So the solver sits inside each layer, between laying out its children and measuring its own box. Overlap strategies and label placement run after it.

## First placement wins

`place` writes a position once, and a node that has one keeps it. A shape with a data position, such as a scatter dot, places itself during its own layout. The solver treats that place as a pin and moves the others around it. Only a `position` constraint overrides it, through `pinAnchor`.

## What a ref does

A `ref` stands where another node is (see [names](/under-the-surface/names)). It asks for its target's request, and when laid out it copies its target's box. Its position is computed each time it is read: the moves from its target up to their closest shared parent, less the moves from its own parent up to that node. So a label can be aligned to a ref, and the solver treats the ref as a fixed point. Refs whose targets depend on each other are a loop, which the asking step reports as an error.

## Does layout run more than once?

In one render, each node asks once and is laid out once. The rewrites before layout rerun name and type resolution, not layout. Two things lay out the whole chart again: `label: { angle: "auto" }`, once per candidate angle (see [labels](/under-the-surface/labels)), and an input that changes the spec, such as a slider.

::: rule A request is a line in σ.
claim(_n_) = ascent(σ) + descent(σ)

A bar of value _v_ asks for *v*σ, and a share of weight _k_ asks for *k*σ.
:::

::: rule A scope solves for σ.
claim(_content_)(σ) = room(_scope_)\
px(_d_) = σ·_d_ + origin

Every node below a scope uses its σ and its origin.
:::

::: rule Leftover room is shared by weight.
room(_i_) = need(_i_) + slack · _w_<sub>_i_</sub> / Σ _w_

Only parts of a row with no size of their own take a share.
:::

::: not-yet-true

- **Percents inside some scopes.** A percent inside a share-sized node, a facet panel, a region cell, a treemap tile or a coordinate space is an error (#1176).
- **Narrow rows.** A row gets the slack of the outline of its whole layer, not its own (#1257).
- **Coordinate spaces.** Their room is in their own units, so the overflow warning is skipped there (#1176).
- **Equal scales.** When x and y share a unit, both take the smaller σ. Where the leftover room goes is provisional (#582).
- **Data 0 for every unit.** Every measure is seated as if it had a 0, dates included (#1051).

:::

## Where this lives in the code

::: code-map

- **Entry** gofish.tsx `layout()` 353, root solve 583, `root.layout` 755, `placeRoot` 796
- **Reruns** gofish.tsx `runLayout` 1103; autoLabelAngle.ts `layoutWithAutoLabelAngles` 242
- **Requests** \_node.ts `resolveExtent` 1550; extent.ts `Extent` 44; pwl.ts `solve` 361
- **Scopes** scopes.ts `seatInScope` 123, `solveFixed` 374, `fit` 512; proposalPlan.ts `solveLayerScales` 281
- **Hand down** \_node.ts `layout` 2540; layer.tsx `layout` 939, `chainRoomsOn` 1187; rect.tsx `layout` 220
- **Solver** layer.tsx `seatByPlan` 1468; claimPlacement.ts `placeByClaims` 367; placementSolver.ts `solvePlacementCells` 387; differenceGraph.ts `solveAxisProblem` 164; formula.ts `evaluate` 145
- **First place** \_node.ts `place` 2928, `pinAnchor` 3042; placementLowering.ts 259
- **Refs** \_ref.tsx `translateOn` 102, `layout` 350

:::
