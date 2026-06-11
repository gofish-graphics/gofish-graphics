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
color pass has nothing to do with them. After the rewrite the pass runs
`resolveNames()` and a memoized `resolveUnderlyingSpace()` (which computes only
the newly inserted nodes).

The pass wraps the chart root in a single `Layer` holding the original content
plus a swatch column:

```
root = Layer([ content.name("__legendContent"), legendColumn(colorMap) ])
```

`legendColumn` is a `Spread({ dir: "y" })` of one row per color-map entry. Each
`legendRow` is a `Spread({ dir: "x" })` of a 10×10 `Rect` swatch and a 10px gray
`Text` label. The rows are **reversed** before spreading: `Spread({ dir: "y" })`
lays children bottom→top in y-up coordinates (the first child gets the smallest
y), so the first color-map entry has to be _last_ in the spread to render at the
top — matching the old bespoke order, which placed entry 0 at the top.

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
via the identity dance), so faceting, refs, and `select` keep resolving to the
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

The fixed 120px `LEGEND_MARGIN` is gone. Because the legend is now a real shape
occupying real space, `layout()` measures how far the laid-out tree (legend
included) extends past the authoritative width:

```ts
const rightOverhang = legendAdded ? Math.max(0, child.dims[0].max - finalW) : 0;
```

and the render pass reserves exactly that on the right of the SVG. The
measurement is gated on `legendAdded`, so legend-free charts keep byte-identical
SVG widths.

When `w` is **omitted**, this falls out for free: the computed extent (#494's
`finalDim` readback off the root bounding box) already includes the swatch
column, so `finalW` covers the legend and `rightOverhang` clamps to 0 — the
legend is simply part of the inferred graphic size.

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
