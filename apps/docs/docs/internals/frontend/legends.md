---
title: Legends
section: Frontend
order: 51
status: draft
covers:
  - packages/gofish-graphics/src/ast/legends/elaborate.tsx
---

# Legends

GoFish draws a color legend automatically from the color scale it infers — a
column of swatches and labels for a **categorical** scale, or a **colorbar** (a
sampled gradient bar with tick labels) for a **continuous** (gradient) one. Like
[axes](/internals/frontend/axes), a legend is **not a privileged node type**. It
is _elaborated_ into ordinary GoFish shapes (`rect`, `text`) and operators
(`spread`, `layer`) wired together with constraints (`align`, `distribute`,
`position`). The render pass has no legend-specific code at all.

## Why elaborate

The legend was the **second-to-last bespoke piece of chrome**. Axis titles
followed it, and both are now elaborated. It used to render as a
`<For>` over `scaleContext.unit.color` in `gofish.tsx`'s `render()`, hand-placing
swatches at `translate(width + pad*3, …)` behind a fixed 120px `LEGEND_MARGIN`
reserved on the right of the SVG. Because it was a render-time fixture rather
than a node, it could not participate in **space allocation** (#493) — its width
was a guessed constant, not a measured extent — nor in **size inference** (#494):
a chart with `w`/`h` omitted had no way to fold the legend into its computed
extent. Elaborating it into the laid-out tree fixes both, and opens the **same
customization seam** axes got in #490: the legend is now built by pure, exported
functions a future public API can override.

## The elaboration pass

A legend is the outermost ring of the chrome of the node that owns the color
encoding (see [Axes](/internals/frontend/axes#the-elaboration-pass) for how
`elaborateChrome` builds the rings). The color scale is resolved once for the
whole render, by a walk from the chart root (`resolveColorScale`), so the root
owns it. `layout()` builds `legendRing(scale, root)` when the scale has
something to show (a non-empty categorical color map, or a continuous color
scale) and stamps it on the root's chrome request, before chrome elaboration
wraps any node of the tree; `elaborateChrome` seats it as the root's outermost
ring. The
`axes` option plays no part, so a legend appears whenever a color encoding
resolved.

The chart option `legend` sets which entries the ring holds: `false` drops
all of them, and `{ color: false }` or `{ y: false }` drops one. With no
entries the root gets no legend ring, and nothing reserves the column's
width. The scale still colors the marks. A chart with 72 categories can keep its colors and drop a swatch
column that would be taller than the chart.

`legendRing` reads the resolved `scaleContext.unit` (the `color` map for a
categorical scale, or the `scaleFn` and `domain` for a continuous one) and
builds `legendColumn` or `legendColorbar` from it. The color scale is resolved
before chrome is elaborated and is not resolved again afterward. Chrome adds no
data colors: legend fills are literal color strings (each colorbar band is
`scaleFn(value)`, baked at elaboration time), never `isValue` data references.

The ring holds the box inside it (the root with its axes and titles) plus the
legend:

```
root = Layer([ titled, legend ])
```

`legendColumn` is a `Spread({ dir: "y" })` of one row per color-map entry. Each
`legendRow` is a `Spread({ dir: "x" })` of a 10×10 `Rect` swatch and a 10px gray
`Text` label. The column's y is ordinal, so the spread reads top-down (see
[Axis direction](/internals/layout/passes#axis-direction)): the entries are listed
top to bottom in the order they are given.

The order is the one the plot lays its color series out in down the screen,
when it lays them out along y, and the color scale's own otherwise. The legend
does not work that out from the shape of the plot. Each operator that chains its parts
along y (a stack or a spread, a `distribute` on y) reports the keys of its parts
in the order they read down the screen (`keysDownTheScreen` in
`constraints/distribute.ts`): its placement order, reversed when its y grows
upward, because such a chain lays its first part at the bottom. A stack reports
its chain whatever the signs of its parts. Inside a coordinate space the chain's
y is a coordinate of that space (a polar radius), not the screen's, so it reports
no order. The legend links to its series structurally, by field: the color scale
records the fields it encodes, and an operator that splits its data by a field
records that field on each of its parts (`__splitBy`). The legend takes the
chain of the outermost operator (breadth first, `seriesDownTheScreen`) that
splits by a field the color scale encodes and lays its parts out along y. So a
stacked bar chart lists its last series first, the one at the top of each bar. The legend follows the plot; the plot's stacking rule never
reads the legend.

A continuous (gradient) colorbar is a continuous value axis, so it grows upward:
the domain max is at the top. Its bands are listed from the top, each showing the
value at its center, and each tick sits `valueToPx(v)` above the bar's base.

### The three constraints

The ring is wired with three constraints, and **the order matters** because
the first one places the box the other two read:

1. `position({ x: 0, y: 0, anchor: "baseline" })` on the box inside, a
   literal-pixel pin at the origin that means "stay exactly where you were laid
   out". Every ring starts with this pin (`wrapRing`). The box is referenced by
   the `distribute` below, and a constraint-referenced child skips the layer's
   phase-1 baseline placement (placement is first-write-wins), so the pin
   states that placement explicitly. It pins the baseline (the local 0 point),
   not the bounding-box corner, so the box never moves however far its axis
   labels reach.
2. `distribute({ dir: "x", spacing: 20 }, [box, column])` seats the column just
   right of the box, which includes the axis labels and titles.
3. `align({ y: top }, [box, column])` top-aligns the column with the box. The
   constraint runs in the ring's axis order, so "top" is the `end` of a y that
   grows upward and the `start` of one that reads top-down (a heatmap):
   `orientSide("start", wrapperDirection(root))`.

The outermost ring inherits the root's `key`, so faceting keeps resolving to it.
The root keeps its `_name`, and every ring is transparent to a name lookup, so
refs and `selectAll` still resolve to the root.

### Why the ring preserves the content's spaces

Inserting a `Layer` around the content could in principle change the chart's
inferred underlying space. It does not, because of `unionChildSpaces`' rule that
an **UNDEFINED** sibling contributes "no opinion" and is ignored in the all-SIZE
gate (the same way ORDINAL siblings are filtered). The swatch column resolves to
UNDEFINED on both axes (fixed-pixel shapes, no data-driven extent), so the
ring's space is the content's space. See
[Underlying Space](/internals/core/underlying-space).

## Length entries

Axes are for scales that have positions. Legends are for scales that do not.
The one read that sorts them is `domainOver(space)` in `underlyingSpace.ts`: a
pinned space maps `"positions"` and gets an axis, drawn in place. A space with
no origin maps only `"widths"`: it is a length scale, with a σ and no origin,
so its data has lengths but no places. It gets no axis. Its guide goes in the
legend, as a color scale's does. The keyed domains are keyed by the same read
(`domainId`), so `KeyedDomains.lengthScales(root, axis)` lists the root's
length scales directly.

Each length scale gets one entry (`lengthEntryNode`): a thin bracket, a line
with a short tick at each end, and one label beside it. Its length is a round
amount near a quarter of the scale's widest extent (`entryAmount`, d3's
`tickStep(0, width, 4)`), and the label is that amount and the measure's name
(`fmtNum`, as an axis labels its ticks), or the title from
`legend: { y: { title } }`. Titles do not flow from `axes`: a dimension with
no origin draws no axis, so `axes.y` does not apply there.

The entry is not pinned in pixels. Its line is an ordinary `Rect` whose
length along the scale's axis is the amount as data (`datum(amount)`), so the
solver sizes it as it sizes a mark: the ring's claim is the hull of what it
holds, and the entry adds an ordinary term in σ to the root's claim. A
datum has no unit, so it joins the scale's keyed domain. The root maps that
domain at the plot's σ: when it fits its content to the render's size, the
entry shares the σ it solves, and when a node with a size of its own maps the
domain (`chart({ w, h })`), the root takes that node's σ
(`ScopeRegistry.keyedSigma`, `rootSizes` in `gofish.tsx`). The render's size
sets no second σ for the entry.

The entries are stacked in the legend column: length entries first, then the
swatches or colorbar, each distributed down the column 14 px apart and aligned
at the start. A horizontal stack's entry lies along x. Small multiples whose
stacks share the root's space share one entry.

The entry is drawn at the root's σ, so two cases are not covered yet
(TODO(#1322)). A length scale that a coordinate transform maps, such as a
polar stream, is mapped in the coord's units, not in pixels of the page, so
`lengthScales` skips a coord's space root. And where sized panels map one
domain at different σs, there is no one σ to show: the root fits its own,
and the entry is drawn at it.

## Sizing: the legend takes room

The fixed 120px `LEGEND_MARGIN` is gone, and so is the measured right overhang
that replaced it. The legend is a ring of the root's chrome, so it takes room
like the axes do (#1032): its swatches and labels claim their sizes, its ring
claims the hull of the box inside and the legend where it is seated, and the
content gets what the chrome leaves of the canvas. The render's `w`/`h` is the whole graphic, legend included,
and when they are omitted the canvas is the root's whole box. See
[Layout & Render Passes](/internals/layout/passes#chrome-around-a-chart).

## Interplay with axis titles

The title ring is inside the legend ring (see
[Axes](/internals/frontend/axes)). So the legend is seated off the box with the
titles, and the title centering never sees the legend column.

This relies on the content node reporting a complete, correctly-positioned
bounding box. Most nodes do, but the polar `coord` node historically emitted an
`{ x, y, w, h }` intrinsic-dims form that set only `min`/`size` and left
`max`/`center` undefined — and was positionally offset from the rendered
content. That poisoned the `distribute` constraint (it seats the column at
`content.dims[0].max`, which was `NaN`), so the fix lives in `coord` itself
(reporting a placed-consistent `[0, size]` box), not in special-casing the
legend.

## The customization seam

`legendRow` / `legendColumn` (categorical) and `legendColorbar` (continuous) are
**pure, exported builders** (no mutation, no context) — the seam a future public
legend API would override, exactly as `elaborateAxis` is for axes. The visual
constants (swatch/bar size, gaps, label font and color) live as module constants
chosen to match the previous bespoke styling.

`legendColorbar` builds the bar as a `layer` of fixed-pixel shapes —
`BAND_COUNT` thin band `Rect`s (each filled `scaleFn(value)`) plus a tick mark +
label per d3 tick — each placed by a literal-pixel `Constraint.position` in the
colorbar's y-down layer (value `v` sits `t·BAR_HEIGHT` above the bar's base, so the
domain max is at the top). The layer's bbox is the union of those shapes, so the
colorbar is measured by normal layout exactly like the swatch column.

## Limitations

- A **tall legend** (more entries than the content is tall) can extend below the
  content bottom. This is a pre-existing failure mode carried over from the
  bespoke layout and is out of scope here.
