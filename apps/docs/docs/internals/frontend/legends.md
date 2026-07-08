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

The legend was the **second-to-last bespoke piece of chrome** (axis titles
followed it; both are now elaborated). It used to render as a
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

`elaborateLegend` (`src/ast/legends/elaborate.tsx`) runs inside `gofish.tsx`'s
`layout()`, _after_ the axis-elaboration block and after the nice-space capture,
and is gated on a **resolved color scale** (not on the `axes` option — a legend
appears whenever a color encoding resolved): a non-empty categorical color map,
or a continuous color scale. It runs after the last `resolveColorScale`,
consuming the already-resolved `scaleContext.unit` (the `color` map for a
categorical scale, or the `scaleFn` + `domain` for a continuous one), and
dispatches to `legendColumn` or `legendColorbar` accordingly.
Crucially, `resolveColorScale` is **not** re-run on the rewritten tree: legend
shape fills are literal color strings (each colorbar band is `scaleFn(value)`,
baked at elaboration time), never `isValue` data references, so the
color pass has nothing to do with them. After the rewrite the pass runs only a
memoized `resolveUnderlyingSpace()` (which computes only the newly inserted
nodes); `resolveNames()` is unnecessary, since the legend subtree carries only
plain string `.name()`s and its constraint refs were already resolved eagerly
inside `elaborateLegend`.

The pass wraps the chart root in a single `Layer` holding the original content
plus a swatch column:

```
root = Layer([ content.name("__legendContent"), legendColumn(colorMap) ])
```

`legendColumn` is a `Spread({ dir: "y" })` of one row per color-map entry. Each
`legendRow` is a `Spread({ dir: "x" })` of a 10×10 `Rect` swatch and a 10px gray
`Text` label. The column entries always read top→bottom, but how the spread gets
there depends on the render orientation (issue #143/#16). It takes
`reverse: yUp`: under the y-UP chart flip a `Spread({ dir: "y" })` lays children
bottom→top (the first child gets the smallest y), so the first color-map entry
must render _last_ to land at the top; in y-DOWN free space the natural order
already reads top→bottom, so no reverse. A continuous (gradient) colorbar is
likewise orientation-aware — it is built in fixed y-up logical coordinates (band
0 at the base, domain max at the top), and for a y-down render it flips which
value each band/tick shows (and the tick pixel via `valueToBarY`) so a sequential
scale still reads max-at-top either way, without disturbing the band-overlap
seam logic.

### The three constraints

The wrapper is wired with three constraints, and **the order matters** because
the first one places the anchor the other two read:

1. `position({ x: 0, y: 0, anchor: "baseline" })` on the content — a
   literal-pixel pin at the origin meaning "stay exactly where you were laid
   out". The content is referenced by the `distribute` below, and a
   constraint-referenced child skips the layer's phase-1 baseline placement
   (placement is first-write-wins), so the pin re-states that placement
   explicitly. It pins the **baseline** (the local 0 point), not the
   bounding-box corner, so the content never moves regardless of axis-label
   overhang.
2. `distribute({ dir: "x", spacing: 20 }, [content, column])` — seats the column
   just right of the content's **full** bounding box, including its axis labels.
3. `align({ y: yUp ? "end" : "start" }, [content, column])` — top-aligns the
   column with the content top. "Top" is the far edge in y-up (`end`) but the
   near edge in y-down free space (`start`), so the anchor follows the render
   orientation; otherwise a y-down chart (e.g. a heatmap) seats its legend at the
   bottom (issue #143/#16).

The wrapper inherits the wrapped node's `key` and `_name` (moved off the content
via the identity dance), so faceting, refs, and `selectAll` keep resolving to the
wrapped node.

### Why the wrapper preserves the content's spaces

Inserting a `Layer` around the content could in principle disturb the chart's
inferred underlying space — and the nice spaces captured just above this pass
must stay valid. They do, because of `unionChildSpaces`' rule that an
**UNDEFINED** sibling contributes "no opinion" and is ignored in the all-SIZE
gate (the same way ORDINAL siblings are filtered). The swatch column resolves to
UNDEFINED on both axes (fixed-pixel shapes, no data-driven extent), so the
wrapper's space is just the content's space. See
[Underlying Space](/internals/core/underlying-space).

## Sizing: measured overhang, not a margin

The fixed 120px `LEGEND_MARGIN` is gone. The canvas size and the legend
reservation are read off **two different nodes**, which is what keeps the
content centered and the legend reserved separately:

- `finalW`/`finalH` (the canvas) read off the **content node** — the original
  pre-wrap node, captured as `contentNode` _before_ both the title wrap and the
  `elaborateLegend` wrap. So the canvas is exactly the content's extent, never
  inflated by a title or a legend.
- `rightOverhang` reads off the **wrapper** (`child`), whose bounding box
  includes the seated swatch column, and subtracts the content width:

```ts
const finalW = finalDim(0, w); // off contentNode
const rightOverhang = legendAdded ? legendOverhang(child, finalW) : 0;
```

`legendOverhang` (in `legends/elaborate.tsx`, next to the constraint that
creates the overhang) returns `wrapper.dims[0].max - finalW`, which is exactly
the `LEGEND_CONTENT_GAP` plus the swatch-column width, so the render pass
reserves precisely the legend on the right of the SVG. The measurement is gated
on an explicit `legendAdded` boolean rather than `child !== contentNode`:
because the axis-title pass _also_ wraps `child`, the identity check would
wrongly fire on a titles-only chart and measure a title gutter as a legend
overhang. With the boolean, legend-free charts keep byte-identical SVG widths.

Reading `finalW`/`finalH` off the content (not any wrapper) matters most when
`w`/`h` are **omitted**: the inferred graphic size is the content's computed
extent (#494's `finalDim` readback), and the title and legend are then reserved
on top of it via the measured gutters — rather than a long title or a tall
legend inflating the inferred size.

## Interplay with axis titles

Axis titles are elaborated just before the legend (see
[Axes](/internals/frontend/axes)), so the two wraps **nest**: the title wrap goes
on first, then `elaborateLegend` wraps that titled subtree. This ordering is what
lets the legend seat itself off the content's _full, titled_ bbox while the title
centering never sees the legend column. `contentNode` stays pointed at the
pre-title, pre-legend content throughout, so neither wrapper feeds back into the
inferred canvas. The title gutters (left for the rotated y-title, bottom for the
x-title) are reserved separately from `rightOverhang` as `leftOverhang` /
`bottomOverhang`, measured off the outermost wrapper. See
[Layout & Render Passes](/internals/layout/passes).

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
bar's own y-up frame (value `v` → `t·BAR_HEIGHT` from the bottom, so the domain
max sits at the top). The layer's bbox is the union of those shapes, so the
colorbar is measured by normal layout exactly like the swatch column.

## Limitations

- A **tall legend** (more entries than the content is tall) can extend below the
  content bottom. This is a pre-existing failure mode carried over from the
  bespoke layout and is out of scope here.
