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
owns it. `layout()` answers the `legend` option of `ChromeOptions` only for the
root. It returns `legendRing(scale, root)` when the scale has something to
show: a non-empty categorical color map, or a continuous color scale. The
`axes` option plays no part, so a legend appears whenever a color encoding
resolved.

The chart option `legend: false` is the one veto. With it, the root gets no
legend ring, and nothing reserves the column's width. The scale still colors
the marks. A chart with 72 categories can keep its colors and drop a swatch
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
root = Layer([ titled.name("__legendContent"), legend ])
```

`legendColumn` is a `Spread({ dir: "y" })` of one row per color-map entry. Each
`legendRow` is a `Spread({ dir: "x" })` of a 10×10 `Rect` swatch and a 10px gray
`Text` label. The column's y is ordinal, so the spread reads top-down (see
[Axis direction](/internals/layout/passes#axis-direction)): the entries are listed
top to bottom in the order they are given.

The order is the one the plot lays its series out in down the screen, when it
lays them out along y, and the color scale's own otherwise. The legend does not
work that out from the shape of the plot. Each operator that chains its parts
along y (a stack or a spread, a `distribute` on y) reports the keys of its parts
in the order they read down the screen (`keysDownTheScreen` in
`constraints/distribute.ts`): its placement order, reversed when its y grows
upward, because such a chain lays its first part at the bottom. A stack reports
its chain whatever the signs of its parts. Inside a coordinate space the chain's
y is a coordinate of that space (a polar radius), not the screen's, so it reports
no order. The legend reads these reports off the content it describes
(`seriesDownTheScreen`, breadth first) and takes the first chain whose parts are
all legend entries. So a stacked bar chart lists its last series first, the one at
the top of each bar. The legend follows the plot; the plot's stacking rule never
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
   grows upward and the `start` of one that reads top-down (a heatmap). The
   ring reads this off `wrapperDirection` of the root.

The outermost ring inherits the root's `key` and `_name`, so faceting, refs, and
`selectAll` keep resolving to it.

### Why the ring preserves the content's spaces

Inserting a `Layer` around the content could in principle change the chart's
inferred underlying space. It does not, because of `unionChildSpaces`' rule that
an **UNDEFINED** sibling contributes "no opinion" and is ignored in the all-SIZE
gate (the same way ORDINAL siblings are filtered). The swatch column resolves to
UNDEFINED on both axes (fixed-pixel shapes, no data-driven extent), so the
ring's space is the content's space. See
[Underlying Space](/internals/core/underlying-space).

## Sizing: measured overhang, not a margin

The fixed 120px `LEGEND_MARGIN` is gone. The canvas size and the legend
reservation are read off two different boxes:

- `finalW`/`finalH` (the canvas, when `w`/`h` are omitted) are read off the
  root's box with axes, `chrome.withAxes`. A title or a legend never inflates
  the inferred canvas.
- The right overhang is read off the outermost ring (`child`), whose box
  includes the legend column: `child.dims[0].max - finalW`.

The render pass reserves the right overhang of a chart with a legend as the
overhang plus a full `pad`, and that of a chart without one through `reserve()`
like the other gutters. The two overlap in size (a single-row legend can
overhang as little as a wide x tick label), so `layout()` tells them apart by
whether the root carries a legend, not by size. The title gutters (left for the
rotated y title, bottom for the x title) are reserved as `leftOverhang` and
`bottomOverhang`, measured off the outermost ring. See
[Layout & Render Passes](/internals/layout/passes).

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
