---
title: How does a chart get its axes?
order: 1
topics:
  - axes
  - ticks
  - axis titles
  - legend
  - labels
  - rewrite
  - elaboration
  - ring
  - ref
  - names
reads:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/axes/elaborate.tsx
  - packages/gofish-graphics/src/ast/labels/elaborate.tsx
  - packages/gofish-graphics/src/ast/elaborationUtils.ts
  - packages/gofish-graphics/src/ast/_ref.tsx
  - packages/gofish-graphics/src/ast/marks/chartBuilder.ts
checked:
  commit: ab7d18a556f51902cdf529e459b7dd5030a514ca
  date: 2026-11-13
cover:
  - figure: rewrite
    rows: 3
    cols: 4
  - figure: names
    rows: 2
    cols: 6
---

<script setup>
import AxesRewrite from "./axes.rewrite.vue";
import AxesNames from "./axes.names.vue";
</script>

You write three lines. GoFish draws bars, a value axis with ticks, category names, two axis titles, and a number over each bar. Nothing in your three lines mentions an axis. This chapter is about where the extra parts come from.

```ts
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }).name("bars").label("value"));
```

The short answer: before GoFish measures or places anything, it rewrites your tree into a bigger tree. The added parts are ordinary nodes, the same `rect`, `text`, `layer` and `ref` you could have written yourself, held in place by the same `position`, `align` and `distribute` constraints. After the rewrite there are no special axis nodes left. Layout never learns that an axis is an axis.

<AxesRewrite />

## The order matters

The rewrite cannot happen first. To draw a value axis GoFish has to know the range of the data, which side the axis goes on, and which node owns it. So the order is:

1. **Build.** The builder turns your chain into a small tree: a frame, a content layer, the layer that `spread` makes, and one `rect` per row.
2. **Work out what the data means.** GoFish resolves references, finds the range of each axis, and decides which node draws each axis. The tree does not change shape in this step, with one exception: `spread` installs its own `align` and `distribute` constraints here.
3. **Rewrite for axes, titles and the legend.** Each node that owns an axis is wrapped in rings. A ring is a plain layer that holds the thing it wraps plus the new parts.
4. **Rewrite for labels.** Each `.label()` becomes a `text` plus a `ref` that stands where the labeled shape is.
5. **Measure and place.** Sizing, layout and drawing run on the rewritten tree.

After each rewrite, step 2 runs again on the new tree, so the new parts get the same treatment as the parts you wrote.

## Three rules that keep it safe

::: rule A wrapper is invisible.
wrap(_n_) = layer{transparent}[ *n*, parts… ]\
<small>and</small> name(wrap(_n_)) = none, key(wrap(_n_)) = key(_n_)

The wrapped node stays in slot 0 and keeps its name. Any lookup that passes through a wrapper sees straight through it.
:::

::: rule The added parts never look a name up.
<small>inside a ring:</small> slot(ring, _k_).\
<small>outside a ring:</small> ref(node)

A part reaches its neighbors by position in the ring, and reaches anything else through a direct handle to the node. So a name you choose can never collide with a name the rewrite uses, because the rewrite uses none.
:::

::: rule The content is placed first, and only once.
position(content, { x: 0, y: 0 })\
<small>comes before every other constraint in the ring</small>

Placement is first write wins. The ring pins its content at the origin, so the new parts can only move themselves, never your bars.
:::

## Names and handles

The rules above lean on `ref`, so here is how names work. There are two systems, and they are easy to mix up.

<AxesNames />

**At build time**, `.name("bars")` tags a node, and a pass files every tagged node in a registry kept per scope. `chart()` opens a scope, `layer([...])` opens a child scope, and `createMark` opens a fresh one. `selectAll("bars")` reads that registry and gets back a list of handles, one per bar. A chart built on that list has one row per handle, and each row carries the data of the bar it points to.

**At layout time**, a string `ref("x")` inside a `.relate()` clause is looked up in the node tree itself. The search starts at the node, then tries its parent, then the parent above that, and stops at the nearest component boundary. The first level that contains the name wins.

Both systems agree on two things. Names are plural: two siblings with the same name are fine, and only a use that needs exactly one match (`ref`) complains when it finds zero or several. And the nearest match wins.

A `ref` draws nothing. It takes the size of its target and reads the target's position again every time it is asked, so it follows a target that is placed later.

::: not-yet-true

- **Polar axes skip the rewrite.** Under a `Coord`, axes are still drawn directly while the tree is lowered (#1110).
- **Rings, not one flat layer.** The design goal is that a chart is one layer of the plot plus its axes and titles as children. Today the code nests one ring per kind of part.
- **The rewrite cannot run twice on one tree.** `label: { angle: "auto" }` rebuilds a fresh tree for every trial for this reason.
- **The nearest-match rule is written twice**, once for the registry and once for the tree walk.
- **Default sizes are not part of this.** An unset size takes the room its parent gives. No rewrite turns it into nodes you could have written.

:::

## Where this lives in the code

::: code-map

- **Build** chartBuilder.ts `resolve()` 953, `frameChart` 1195
- **Meaning** gofish.tsx `layout()` 353 to 492; spread.tsx 170 to 203
- **Axes, titles** axes/elaborate.tsx `elaborateChrome` 1661, `positionAxis` 350
- **Legend** legends/elaborate.tsx `legendRing` 238
- **Labels** labels/elaborate.tsx `elaborateLabels` 529
- **Wrapper rule** elaborationUtils.ts `wrapPreservingIdentity` 22 to 38, `wrapRing` 72 to 124
- **Tree walk for names** \_ref.tsx `closestAtLevel` 624, `lookupName` 667 to 678
- **Registry for names** markResult.ts `LayerContext` 55, `register()` 103, `lookup()` 172

:::
