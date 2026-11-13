---
title: What happens between chart(...) and the pixels on screen?
label: Pipeline
order: 1
topics:
  - pipeline
  - stages
  - render
  - layout
  - coordinate transforms
  - Coord
  - display list
  - claim
  - sigma
  - Grammar of Graphics
  - re-render
reads:
  - packages/gofish-graphics/src/ast/marks/chartBuilder.ts
  - packages/gofish-graphics/src/ast/marks/terminals.ts
  - packages/gofish-graphics/src/ast/marks/chart.ts
  - packages/gofish-graphics/src/interaction/renderTerminal.ts
  - packages/gofish-graphics/src/interaction/runtime.ts
  - packages/gofish-graphics/src/interaction/live.ts
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/extent.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/spread.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/layer.tsx
  - packages/gofish-graphics/src/ast/coordinateTransforms/coord.tsx
  - packages/gofish-graphics/src/ast/coordinateTransforms/polar.ts
  - packages/gofish-graphics/src/ast/coordinateTransforms/bake.ts
  - packages/gofish-graphics/src/ast/axes/autoLabelAngle.ts
  - packages/gofish-graphics/src/ast/displayList/lower.ts
  - packages/gofish-graphics/src/ast/displayList/toDisplayList.ts
  - packages/gofish-graphics/src/ast/displayList/paintSVG.tsx
checked:
  commit: 3e52867e4d31dfe0b02e148c22c225f1d33b5a12
  date: 2026-11-13
cover:
  - figure: stages
    rows: 3
    cols: 3
---

<script setup>
import PipelineStages from "./pipeline.stages.vue";
</script>

You write a chart and ask for it at 300 by 200 pixels.

```ts
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(el, { w: 300, h: 200 });
```

Between that call and the bars on screen, GoFish runs seven stages. Five of them run inside one function, `layout()`. This chapter names each stage, what it takes and what it makes, and which stages run more than once.

<PipelineStages />

## The stages in order

1. **Build.** `render` calls the builder's `resolve()`. The operators in `.flow()` wrap the mark, and the wrapped mark is called with the rows. `spread` splits the rows by `category` and calls `rect` once per group. The chart wraps the result in two layers, its own and a content layer. The result is six nodes with no sizes and no places. The [lowering](/under-the-surface/lowering) chapter covers this stage.
2. **Resolve.** GoFish fixes the colors. Then each node finishes the work that needed its axis names: only now does `spread` know what `x` names, so only now does it install its `align` and `distribute` constraints. Every `ref` finds its target. Then a walk from the leaves up gives each node a type on each axis, in the code an "underlying space": here an ordinal axis of A, B and C, and a continuous axis of `value` from 0 to 7. Last, one domain is fixed for each unit of measure.
3. **Elaborate.** GoFish decides which node draws each axis. Then it rewrites the tree: axes, titles and the legend become ordinary nodes in layers called rings, wrapped around the chart, and each `.label()` becomes a `text` and a `ref`. Six nodes become 68. See [axes](/under-the-surface/axes) and [labels](/under-the-surface/labels).
4. **Ask.** Each node asks for room, from the leaves up. What it asks for, its claim, is the room it needs as a function of σ (sigma), the number of pixels for one unit of data. Setting the root's claim equal to the canvas solves for σ. Here σ on y is 21.86: the bar of 7 is 153 pixels, and the axis parts take the other 47.
5. **Place.** `root.layout` runs from the root down. Each node is handed its room and its σ and lays out its children, and its constraints place them. Then the root is placed on the canvas. Every node now has a size and a place in pixels. See [layout](/under-the-surface/layout).
6. **Lower.** The bake flattens the tree into a list in paint order. Each node lowers itself into display items, such as `rect`, `text` and `path`, in absolute canvas pixels. Here that is 39 items. `toDisplayList()` stops at this stage.
7. **Paint.** Each item becomes an SVG element, and Solid mounts the `<svg>` in your container.

## Which stages run again

In one pass the order is fixed. Three things repeat.

- **Resolve, after each rewrite.** New nodes have no types, refs or constraints yet. So after Elaborate changes the tree, Resolve runs again on the whole tree, once after the axes and once after the labels. The colors are not resolved again.
- **Build to Place, once per angle.** With `label: { angle: "auto" }`, GoFish lays the chart out once per candidate angle and keeps, for each row of labels, the first angle that fits. Each run builds a fresh tree, because Place writes into the nodes. The chosen run goes on to Lower and Paint.
- **Everything, when an input changes.** When the spec reads an input, such as a `timer`, outside `live()`, the chart runs again from Build into the same container.

Paint can also run alone. A `live()` value is read before layout, for measuring, and again in Paint on every frame, where Solid changes only that attribute.

So the stages are still steps in a fixed order. What repeats is a run from the start, Resolve after a rewrite, or Paint alone.

::: rule A tree is laid out once.
layout(_t_) writes size(_n_), place(_n_) <small>for every</small> _n_ ∈ _t_

To lay a chart out again, GoFish builds a new tree.
:::

::: rule Every rewrite is followed by Resolve.
elaborate(_t_) = _t_′ ≠ _t_ ⟹ resolve(_t_′)

The new nodes get names, refs and types like yours.
:::

::: rule Types never read claims.
type(_n_) <small>is fixed before any</small> claim(_n_)

The code throws if a claim is read during the type walk.
:::

## When layout happens

Layout is Ask and Place. It comes late, because a claim needs the final tree, since ticks and labels take room. It needs the domains, since σ maps them to pixels. It needs every constraint and ref, since they place the children. And it needs the fonts, since text is measured, so the render waits for `document.fonts.ready` first.

## Where a Coord fits

A `Coord` is not a stage but a node. `chart(data, { coord: Coord.polar() })` makes the chart's own layer a `coord` node. It acts at three stages.

- **Resolve.** It names its axes, here `theta` and `r`. It keeps its children's types for its own scope, so to its parent it is a box of pixels.
- **Place.** It turns its box into a budget in its own units: its angle, by a radius of half the shorter side less padding. Its children are laid out in that budget with their own σ.
- **Lower.** It lowers each child through its transform. Under polar, the three bars lower to three `path` items, not `rect` items.

So a Coord changes the units and the drawn shapes, not the tree. It also skips Elaborate: polar axes are not added as nodes.

## Against the Grammar of Graphics

Wilkinson's pipeline has seven steps: variables, algebra, scales, statistics, geometry, coordinates, aesthetics. In GoFish, Build covers variables, algebra and statistics. Scales are not a stage: domains come from types in Resolve, and pixels per unit from the room, in Ask. Geometry gets its sizes and places from constraints in Place. Coordinates are a node that can sit anywhere in the tree, not a step after geometry. Color is resolved at the start of Resolve. Elaborate and layout have no step there at all.

::: not-yet-true

- **Polar axes skip Elaborate.** A polar chart's axes are drawn by the `coord` node at Lower, and only when the chart sets `axes` itself (#1110).
- **A tree is laid out only once.** So `label: { angle: "auto" }` rebuilds the whole chart for each angle, and it throws for a node built by hand.
- **The bake still points at nodes.** Each baked entry lowers through its source node. The goal is a list of shapes with no link back to the tree (#75).
- **A new self-drawing operator must be listed by hand** as a bake boundary. If it is missing, its drawing is dropped without an error (#75).
- **A fitted space draws no axes.** `Coord.geo` throws when asked for axes, and a shape partly outside its frame is drawn whole.

:::

## Where this lives in the code

::: code-map

- **Terminals** marks/terminals.ts `attachBuilderTerminals` 126; chartBuilder.ts `resolveForRender` 1438
- **Build** chartBuilder.ts `resolveNamed` 983, `frameChart` 1195; marks/markResult.ts `resolveMarkResult` 297
- **One pass** gofish.tsx `runLayout` 1103, `layoutOnce` 1114, `layout` 353
- **Resolve** gofish.tsx 407 to 416, `reresolve` 426; \_node.ts `resolveAliases` 2254, `resolveUnderlyingSpace` 1270; \_ref.tsx `resolveReferences` 730; spread.tsx 171
- **Elaborate** gofish.tsx `elaborateChrome` call 493, `elaborateLabels` call 515
- **Ask** gofish.tsx 535 to 755; \_node.ts `resolveExtent` 1550; extent.ts `Extent` 44
- **Place** gofish.tsx `root.layout` 755, `placeRoot` 796; \_node.ts `layout` 2540
- **Lower** displayList/lower.ts `lowerToDisplayList` 23; coordinateTransforms/bake.ts `bake` 122, `BAKE_BOUNDARY_TYPES` 85
- **Paint** gofish.tsx `render` 1543; displayList/paintSVG.tsx `paintDocument` 64
- **Runs again** axes/autoLabelAngle.ts `layoutWithAutoLabelAngles` 242; interaction/renderTerminal.ts `renderWithInteraction` 59; interaction/live.ts `live` 44
- **Coord** layer.tsx 229; coordinateTransforms/coord.tsx `coord` 175, `layout` 318, `lower` 665

:::
