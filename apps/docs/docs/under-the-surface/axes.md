---
title: How does a chart get its axes?
label: Axes
order: 3
topics:
  - axes
  - ticks
  - axis titles
  - legend
  - typing
  - underlying space
  - ordinal
  - continuous
  - keyed domains
  - axis owner
  - rewrite
  - elaboration
  - ring
reads:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/underlyingSpace.ts
  - packages/gofish-graphics/src/ast/keyedDomains.ts
  - packages/gofish-graphics/src/ast/axes/elaborate.tsx
  - packages/gofish-graphics/src/ast/axes/axisSpan.tsx
  - packages/gofish-graphics/src/ast/elaborationUtils.ts
  - packages/gofish-graphics/src/ast/legends/elaborate.tsx
  - packages/gofish-graphics/src/ast/marks/chartBuilder.ts
  - packages/gofish-graphics/src/ast/shapes/rect.tsx
  - packages/gofish-graphics/src/ast/shapes/ref.tsx
  - packages/gofish-graphics/src/ast/constraints/distribute.ts
  - packages/gofish-graphics/src/ast/coordinateTransforms/coord.tsx
checked:
  commit: 3e52867e4d31dfe0b02e148c22c225f1d33b5a12
  date: 2026-11-13
cover:
  - figure: rewrite
    rows: 3
    cols: 4
---

<script setup>
import AxesRewrite from "./axes.rewrite.vue";
</script>

Here is a bar chart.

```ts
chart([
  { category: "A", value: 3 },
  { category: "B", value: 7 },
  { category: "C", value: 5 },
])
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { w: 300, h: 200 });
```

GoFish draws three bars, a value axis with 15 ticks, the names A, B and C, and the titles "category" and "value". The spec mentions none of these. They come from a rewrite of the node tree, and what the rewrite builds is decided by typing, which runs first.

## Typing

Typing means working out, for each node and each direction, three things: what kind of space the node has, what range of data it covers, and which node draws the axis. In the code a node's type is its underlying space, one for x and one for y.

There are three kinds of space.

- A **number line** (`continuous`) holds data values on one scale and records where its 0 is. It is _pinned_ when its 0 is data 0. It is _free_ when it is an amount hanging from a baseline no one has placed yet. It has _no origin_ when only widths along it mean anything, as after a middle alignment.
- A **set of named slots** (`ordinal`) holds one slot per key, in order, and the fields that made the keys.
- **Nothing** (`undefined`) means no data in that direction.

Three passes fill in the three parts. First, `resolveUnderlyingSpace` walks up from the leaves. Each bar has `h: "value"`, so its y is free, from 0 to its value, and its x is nothing. The spread gives each bar a slot by `category`, so its x is the slots A, B and C. Its y joins the bars: free, from 0 to 7.

Second, `KeyedDomains.build` finds the data ranges. For each space root (the render root, or a node that starts a frame of its own), direction and unit, it joins the ranges of the nodes in that unit. Here there is one keyed domain: "value" on y, from 0 to 7.

Third, `resolveAxes` walks down from the root and picks each axis's owner. A slot axis goes to the highest node with those slots. A number axis goes to the highest chart box (the layer `chart()` makes) or the render root, and only when its space there is pinned or has no origin. The chart box places its own baseline, so `placedSpace` reads its free 0 to 7 as pinned, and the chart box draws both axes. It stamps a tick count, about 10, on itself. A keyed domain with an axis over it is _niced_ when it is solved: its ends are rounded out to ticks. 0 to 7 stays 0 to 7, with a tick every 0.5.

<AxesRewrite />

## The order of events

`layout()` runs these steps in this order. The whole pipeline is in [the pipeline chapter](/under-the-surface/pipeline).

1. The color scale is resolved, operators install their constraints, and refs are resolved.
2. Typing: kinds of space, keyed domains, owners.
3. The legend and titles are requested on the root and the charts.
4. The rewrite (`elaborateChrome`) builds axes, titles and legend.
5. The new tree is typed again, so the new nodes have types.
6. Labels are built ([the labels chapter](/under-the-surface/labels)).
7. Sizes and positions are solved ([the layout chapter](/under-the-surface/layout)).

The rewrite cannot come first because every choice it makes reads a type. The owner says which node gets an axis. The kind of space says which axis. The niced keyed domain says where the ticks fall. The type's field or measure is the title.

The rewrite reads these and never decides them. Step 5 gives the new nodes types, but the keyed domains are not rebuilt: a ring reads the domain of the content it wraps. The rewrite also keeps its parts out of the types. Each part of a ring is a set of its own, so a tick never joins the content's range.

## What each kind of space builds

The rewrite works from the leaves up and wraps each owner in _rings_. A ring is an ordinary `layer` whose first child is what it wraps and whose other children are the axis parts. The rings go outward in this order: number axes, slot rows, titles, legend.

- **Pinned number line.** A `rect` line placed across the niced range, and per tick a `spread` of a `text` and a short `rect`, placed at its value in the content's frame. A `distribute` seats the line past the content, and an `align` lines the ticks up on it. A time scale labels in rows of calendar units.
- **Number line with no origin.** A line across the niced width, bare ticks, and a label between each pair of ticks that gives the step.
- **Free number line.** Nothing, until a chart box or the root places it.
- **Named slots.** Per slot, a `text` and a `ref` to that slot's node, aligned along the axis and distributed past the content. An `axisSpan` from the first slot to the last centers the title. A nested grouping adds outer rows.
- **Nothing**, or slots made from positions and not from a field: no axis.

Slot rows get a ring outside the number axes, because a `ref` reads its target where it is laid out, after the number axis has moved it.

A slot axis is titled by its field, "category", and a number axis by its measure, "value". The legend comes from the color scale, not the types. The root owns it, as its outermost ring.

## Rules

::: rule Who draws a slot axis
draws(_n_, _d_) <small>if</small> type(_n_, _d_) = slots _K_ <small>from a field</small>\
<small>and no node above</small> _n_ <small>draws</small> _K_ <small>on</small> _d_

A finer grouping under a coarser one draws its own row.
:::

::: rule Who draws a number axis
draws(_n_, _d_) <small>if</small> placed(_n_, _d_) <small>is pinned or has no origin</small>\
<small>and</small> _n_ <small>is a chart box or the root</small>\
<small>and no node above</small> _n_ <small>claimed</small> _d_

A number axis has one owner.
:::

::: rule A ring is invisible.
ring(_n_) = layer{transparent}[ *n*, parts… ]\
key, visibility, order, hidden: _n_ → ring(_n_)

The ring takes no name, and how _n_ sat among its siblings moves to the ring.
:::

::: rule Parts use handles.
part → slot _k_ of ring(_n_) <small>or</small> ref(node)

No added part looks a name up.
:::

::: rule The content is placed first.
constraints(ring(_n_)) = [ position(*n*, 0, baseline), … ]

The axis parts move around the content, and the content stays put.
:::

How a user's own names and refs resolve is in [the names chapter](/under-the-surface/names).

::: not-yet-true

- **Axes in a coordinate space are not nodes.** Under a coordinate transform, such as polar, `resolveAxes` turns off the cartesian axes, and the transform draws its own axes when it renders.
- **Not every part is something a user could write.** `axisSpan`, and the box a start-aligned slot label sits on, are internal node types with no public form.
- **A time axis does not rotate its labels.** An angle given for one of its rows is an error.
- **Mirrored axes lose their mark in some joins.** Merging axes in a layer drops the mark that makes a centered stack's axis count away from 0 (#995).
  :::

## Where this lives in the code

::: code-map

- **Steps in order** gofish.tsx `layout` 353
- **Kinds of space** underlyingSpace.ts `UnderlyingSpace` 159
- **A node's type** \_node.ts `resolveUnderlyingSpace` 1270
- **A bar's free amount** shapes/rect.tsx `magnitude` 198
- **Slots from a spread** constraints/distribute.ts `distributeSpaceFold` 313
- **Data ranges** keyedDomains.ts `KeyedDomains.build` 103
- **Owners** \_node.ts `resolveAxes` 2360
- **A placed baseline** \_node.ts `placedSpace` 1516
- **Which axis a type draws** underlyingSpace.ts `axisOver` 279
- **Titles from types** underlyingSpace.ts `spaceTitle` 769
- **The rewrite** axes/elaborate.tsx `elaborateChrome` 1661
- **One owner's axes** axes/elaborate.tsx `elaborationsFor` 1308
- **Number axis** axes/elaborate.tsx `elaborateContinuousAxis` 489
- **Axis with no origin** axes/elaborate.tsx `elaborateDifferenceAxis` 639
- **Slot axis** axes/elaborate.tsx `elaborateOrdinalAxis` 869
- **A ring** elaborationUtils.ts `wrapRing` 72
- **Legend** legends/elaborate.tsx `legendRing` 238
- **Coordinate space axes** \_node.ts `resolveAxes` 2376
  :::
