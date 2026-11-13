---
title: How does a label find its place?
label: Labels
order: 5
topics:
  - labels
  - label placement
  - Place
  - Place.around
  - Place.along
  - Place.end
  - Place.interior
  - avoiding
  - collision
  - text measurement
  - hidden labels
reads:
  - packages/gofish-graphics/src/ast/labels/elaborate.tsx
  - packages/gofish-graphics/src/ast/labels/labelNode.tsx
  - packages/gofish-graphics/src/ast/labels/labelPlacement.ts
  - packages/gofish-graphics/src/ast/labels/placeStep.ts
  - packages/gofish-graphics/src/ast/labels/strategies.ts
  - packages/gofish-graphics/src/ast/labels/collide.ts
  - packages/gofish-graphics/src/families/place.ts
  - packages/gofish-graphics/src/ast/shapes/text.tsx
  - packages/gofish-graphics/src/ast/shapes/ellipse.tsx
  - packages/gofish-graphics/src/ast/constraints/index.ts
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/geometry/outline.ts
  - packages/gofish-ir/src/frontend/descriptors.ts
checked:
  commit: 3e52867e4d31dfe0b02e148c22c225f1d33b5a12
  date: 2026-11-13
cover:
  - figure: chooser
    rows: 3
    cols: 6
---

<script setup>
import LabelsChooser from "./labels.chooser.vue";
</script>

Four cities on a scatter plot, each dot named:

```ts
chart(cities, { axes: false })
  .flow(scatter({ by: "name", x: "x", y: "y" }))
  .mark(circle({ r: 5 }).label("name"));
```

Two of the dots are about 10 pixels apart, and one sits in a corner. Yet every name lands in a free spot. This chapter is about how GoFish picks those spots.

## What `.label()` becomes

A `.label()` call only records a request on the node. After the axes are added, a rewrite turns each request into plain nodes (see the [axes chapter](/under-the-surface/axes)). The result is one extra layer around the content of the nearest chart, holding the content, one `ref` per labeled mark and one `label` node per label. A `ref` is a stand-in that reads where another node was placed. The tree for the example, simplified from what `book:tree` prints:

```text
layer  {transparent}  [position, labelPlace]
  layer  {chartContent}  [position ×4]
    ellipse  key=Lima    (and Quito, Oslo, Rome)
  ref → ellipse key=Lima    (one per dot)
  label                     (one per dot)
```

The `position` constraint pins the content at the origin, so a label can never move the marks it describes.

## Two ways to place a label

A **position string**, such as `"outset-top"` or `"center"`, names one spot by the mark's box. It becomes `align` and `distribute` constraints between the label and its mark's `ref`, and the layout solver places it like any other node. It is never hidden.

A **`Place` strategy**, such as `Place.around()`, reads the mark's outline and offers several spots, best first. These labels share one `labelPlace` constraint per layer. The solver cannot solve it, so it runs after the solve, when every mark is placed. That step is the label chooser.

When you give no `position`, the mark decides. A dot uses `Place.around()`, an arrow `Place.end()`. A line, a band and a polygon read their outline: a filled region takes `Place.interior()`, an unfilled closed one `Place.around()`, an open path `Place.end()`. Every other mark, a bar for instance, takes the string `"outset"`, centered above the box.

## The chooser, one label at a time

<LabelsChooser />

The chooser works through the labels of one `.label()` call in data order. For each one, it asks the strategy for spots one at a time and takes the first that fits. A spot fits when two things hold:

1. The label's box lies inside the frame, the area the layer was given. This keeps labels off the axes and titles around the plot.
2. The box, grown by 1 pixel, covers no obstacle.

The obstacles are every mark the layer labels, the labels placed so far (including labels at a position string and those of charts nested inside), and the nodes listed in the call's `avoiding` option. Calls go in the order their first label appears. A mark is an obstacle as the ink it draws: each piece of its outline as wide as its stroke, plus its inside when it is filled. A label may sit inside its own mark but may not cross the band of its own outline, unless the strategy puts it on the outline on purpose.

There is no score and no going back, so the order of the rows is the order of priority. In the figure, Quito loses its first two spots because Lima came first.

A label with no spot that fits is hidden. It draws nothing, and its box shrinks to an empty box at its mark's center, so it takes no room. After the layout, GoFish prints one note for the whole render. Crowding five dots into a 120 × 60 chart prints:

```text
[gofish] Some labels were hidden because no candidate spot was free: 2 of 5 for .label("name") with Place.around().
```

## The strategies

Each strategy turns the outline into a list of spots. Only `interior` ranks them by a measure; the others use a fixed order.

- **`Place.around()`** tries eight directions: upper right, upper left, lower right, lower left, right, left, top, bottom. For each, it sets the label 3 pixels outside the outline's farthest point that way. `directions` changes the list. `side: ["outset", "inset"]` also tries just inside.
- **`Place.along()`** starts at `at` on the outline, the middle by default, then slides in 3 pixel steps, alternating forward and back. At each step it tries every `side` listed. A label with `orient: "sloped"` turns to follow the line and skips spots where the line bends too much.
- **`Place.start()` and `Place.end()`** offer one spot each, just past the first or last point of a path. Labels of one call that overlap there slide apart vertically, and any that still covers an obstacle is hidden. The frame does not hold them, since end labels usually sit in the margin.
- **`Place.interior()`** searches a grid inside a filled region for the points where the label's box could grow largest before touching the outline. It offers up to 12, largest room first, and only where the box fits.

## How big is a label before it is placed

The chooser needs each label's box before it tries a spot. The label node measures its text once, when the rewrite makes it. In a browser it asks a canvas to measure the text in the label's font. The height comes from the font's ascent and descent where the browser reports them, so every label in one font is equally tall. Outside a browser there is no canvas, and the width is 0.6 of the font size per character. A halo or a background adds a margin on each side. A sloped label turns this box to its angle.

A label at a position string takes room in the layout like any text. A label the chooser places does not, since its spot is unknown while sizes are worked out.

::: rule First fit, in order.
label*i* takes the first _c_ in spots(place*i*)\
<small>such that</small> box(_c_) ⊆ frame <small>and</small> box(_c_) <small>grown by 1px</small> covers nothing in obstacles*i*

Each label takes the first spot that fits, and nothing earlier is reconsidered.
:::

::: rule What is in the way.
obstacles*i* = marks ∪ avoiding ∪ labels <small>placed before</small> label*i*

The marks are every mark this layer labels. A label's own mark counts only as its outline.
:::

::: rule No spot, no label.
spots(place*i*) exhausted ⇒ hidden(label*i*)

A hidden label draws nothing and takes no room, and the render prints one note that counts them.
:::

::: not-yet-true

- **Warped spaces.** In a polar or other warped coordinate space, the chooser cannot read a mark's outline on the screen. A `Place` strategy written out there throws an error, and a default falls back to `"outset"` (#1201).
- **Chosen labels take no room.** The chart does not make space for a label the chooser places. Where the render gives no size, the canvas grows to hold it (#1032).
- **Two systems.** Position strings and `Place` strategies are separate code paths. A label at a position string avoids nothing.
- **Measurement depends on where it runs.** Without a canvas the width is an estimate, so a label can land in a different spot in Node than in a browser.

:::

## Where this lives in the code

::: code-map

- **`.label()`** \_node.ts `label` 3528
- **Rewrite** labels/elaborate.tsx `elaborateLabels` 529, `wrapWithLabels` 341, `homeOf` 495
- **Position or default** labels/elaborate.tsx `positionOf` 143; ellipse.tsx `labelPosition` 66
- **Position strings** labels/elaborate.tsx `buildLabelConstraints` 253
- **Label node and size** labels/labelNode.tsx `LabelText` 116; shapes/text.tsx `estimateTextDimensions` 49
- **When the chooser runs** constraints/index.ts `applyConstraints` 348
- **Chooser** labels/placeStep.ts `applyLabelPlacement` 166, `clear` 292, the loop 323, `placeByOutline` 378
- **Hidden note** labels/placeStep.ts `reportHiddenLabels` 474
- **Strategies** labels/strategies.ts `aroundCandidates` 250, `alongCandidates` 346, `endSpot` 517, `dodgeVertically` 553, `interiorCandidates` 648
- **Obstacles** labels/collide.ts `outlineObstacles` 228, `ObstacleGrid` 266
- **The `Place` family** families/place.ts `around` 94, `along` 122, `start` 139, `end` 156, `interior` 170

:::
