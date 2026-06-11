---
title: Legends
section: Frontend
order: 51
status: draft
covers:
  - packages/gofish-graphics/src/ast/legends/elaborate.tsx
---

# Legends

GoFish draws a color legend — a column of swatches and labels — automatically
from the categorical color scale it infers. Like [axes](/internals/frontend/axes),
a legend is **not a privileged node type**. It is _elaborated_ into ordinary
GoFish shapes (`rect`, `text`) and operators (`spread`, `layer`) wired together
with constraints (`align`, `distribute`). The render pass has no legend-specific
code at all.

## Why elaborate

The legend was the **last bespoke piece of chrome**. It used to render as a
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
and is gated on a **non-empty color map** (not on the `axes` option — a legend
appears whenever a color encoding resolved to swatches). It runs after the last
`resolveColorScale`, consuming the already-populated `scaleContext.unit.color`.
Crucially, `resolveColorScale` is **not** re-run on the rewritten tree: legend
swatch fills are literal color strings, never `isValue` data references, so the
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
`Text` label. The column uses `Spread`'s `reverse: true`: `Spread({ dir: "y" })`
lays children bottom→top in y-up coordinates (the first child gets the smallest
y), so the first color-map entry has to render _last_ in the spread to end up at
the top — matching the old bespoke order, which placed entry 0 at the top.

### The three constraints

The wrapper is wired with three constraints, and **the order matters** because
the first one places the anchor the other two read:

1. `align({ x: "baseline", y: "baseline" })` on the content — a _baseline_
   (origin) pin meaning "stay exactly where you were laid out". The content is
   referenced by the `distribute` below, and a constraint-referenced child skips
   the layer's phase-1 baseline placement (placement is first-write-wins), so the
   pin re-states that placement explicitly. It pins the **baseline**, not the
   bounding-box corner, so the content never moves regardless of axis-label
   overhang.
2. `distribute({ dir: "x", spacing: 20 }, [content, column])` — seats the column
   just right of the content's **full** bounding box, including its axis labels.
3. `align({ y: "end" }, [content, column])` — top-aligns the column with the
   content top (in y-up coordinates, `end` is the top).

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

- `finalW`/`finalH` (the canvas, and the basis for axis-title centering) read
  off the **content node** — the original pre-wrap node, captured as
  `contentNode` before `elaborateLegend` replaces `child` with the wrapper. So
  the canvas is exactly the content's extent, never content + legend.
- `rightOverhang` reads off the **wrapper** (`child`), whose bounding box
  includes the seated swatch column, and subtracts the content width:

```ts
const finalW = finalDim(0, w); // off contentNode
const rightOverhang = child !== contentNode ? legendOverhang(child, finalW) : 0;
```

`legendOverhang` (in `legends/elaborate.tsx`, next to the constraint that
creates the overhang) returns `wrapper.dims[0].max - finalW`, which is exactly
the `LEGEND_CONTENT_GAP` plus the swatch-column width, so the render pass
reserves precisely the legend on the right of the SVG. The measurement is gated
on whether a legend wrapper was added (`child !== contentNode`), so legend-free
charts keep byte-identical SVG widths.

Reading `finalW`/`finalH` off the content (not the wrapper) matters most when
`w`/`h` are **omitted**: the inferred graphic size is the content's computed
extent (#494's `finalDim` readback), and the legend is then reserved on top of
it via `rightOverhang` — rather than the legend inflating the inferred size and
dragging the x-axis title off-center with it.

This relies on the content node reporting a complete, correctly-positioned
bounding box. Most nodes do, but the polar `coord` node historically emitted an
`{ x, y, w, h }` intrinsic-dims form that set only `min`/`size` and left
`max`/`center` undefined — and was positionally offset from the rendered
content. That poisoned the `distribute` constraint (it seats the column at
`content.dims[0].max`, which was `NaN`), so the fix lives in `coord` itself
(reporting a placed-consistent `[0, size]` box), not in special-casing the
legend.

## The customization seam

`legendRow` and `legendColumn` are **pure, exported builders** (no mutation, no
context) — the seam a future public legend API would override, exactly as
`elaborateAxis` is for axes. The visual constants (swatch size, gaps, label font
and color) live as module constants chosen to match the previous bespoke styling.

## Limitations

- A **gradient** color config currently yields one swatch row per color-map
  entry, matching the bespoke path. A continuous **colorbar** is a follow-up.
- A **tall legend** (more entries than the content is tall) can extend below the
  content bottom. This is a pre-existing failure mode carried over from the
  bespoke layout and is out of scope here.
