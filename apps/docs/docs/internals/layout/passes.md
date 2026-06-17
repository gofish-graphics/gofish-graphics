---
title: Overview
section: Layout & Rendering
order: 50
group: Layout
status: draft
covers:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/shapes/rect.tsx
---

# Layout and Render Passes in GoFish Graphics

This document explains the order and mechanics of layout and render passes in the GoFish graphics system, with specific examples and code references.

## Overview

The GoFish rendering pipeline transforms a declarative chart specification into a rendered SVG visualization through a series of well-defined passes. The process can be divided into two main phases:

1. **Layout Phase**: Computes positions, sizes, and spatial relationships
2. **Render Phase**: Generates SVG elements from the laid-out tree

## Entry Point: The `gofish()` Function

The rendering process begins with the `gofish()` function in `src/ast/gofish.tsx`. This function orchestrates the entire pipeline:

```tsx
const runGofish = async (): Promise<LayoutData> => {
  const session: RenderSession = {
    scopeContext: new Map(),
    scaleContext: { unit: { color: new Map() } },
    keyContext: {},
  };

  try {
    const contexts = {
      session,
    };

    const layoutResult = await layout(
      { w, h, x, y, transform, debug, defs, axes, axisFields },
      child,
      contexts
    );

    return {
      ...layoutResult,
      scaleContext: session.scaleContext,
      keyContext: session.keyContext,
    };
  } finally {
    // session is per-run and naturally discarded here
  }
};
```

## Layout Phase

The layout phase is handled by the `layout()` function, which performs multiple passes over the chart tree.

### Pass 1: Context Initialization

**Location**: `src/ast/gofish.tsx:272-275`

Three per-run session contexts are initialized:

- **`scopeContext`**: Manages variable scoping and data bindings (type: `Map`)
- **`scaleContext`**: Stores computed color scales and scale mappings (type: `{ unit: { color: Map<any, string> } }`)
- **`keyContext`**: Maps string keys to nodes for axis labeling (type: `{ [key: string]: GoFishNode }`)

These are attached to the render session and propagated to the node tree, rather than stored as module-global mutable state. This establishes clean state for the rendering process and ensures no interference between multiple chart renders.

### Pass 2: Color Scale Resolution

**Location**: `src/ast/gofish.tsx:172`

```typescript
child.resolveColorScale();
```

**Implementation**: `src/ast/_node.ts:175-192`

This pass traverses the tree and:

- Identifies color encodings (e.g., `fill: "category"` in bar charts)
- Assigns colors from the `color6` palette
- Stores mappings in `scaleContext.unit.color`

**Example**: In a bar chart with `fill: "category"`, each unique category value gets assigned a color from the palette.

### Pass 3: Name Resolution

**Location**: `src/ast/gofish.tsx:173`

```typescript
child.resolveNames();
```

**Implementation**: `src/ast/_node.ts:194-201`

Maps named nodes to the scope context, enabling references between chart elements. This resolves variable names and data bindings, mapping data field names to their corresponding values and establishing scope relationships between parent and child nodes.

### Pass 4: Key Resolution

**Location**: `src/ast/gofish.tsx:174`

```typescript
child.resolveKeys();
```

**Implementation**: `src/ast/_node.ts:203-210`

Assigns unique keys to nodes. These keys are critical for:

- **Axis labeling**: Ordinal axes use keys to position category labels

(Legends do not use keys — they are elaborated from the resolved color map; see
[Legends](/internals/frontend/legends).)

**Example**: In a bar chart using `spread("category", { dir: "x" })`, each bar gets a key like `"category-value"`, which is later used to position the x-axis labels.

### Pass 5: Size Domain Inference

**Location**: `src/ast/gofish.tsx:175`

```typescript
const sizeDomains = child.inferSizeDomains();
```

**Implementation**: `src/ast/_node.ts:225-232`

Determines the intrinsic size requirements for each dimension. For `rect` shapes, this is implemented in:

**Location**: `src/ast/shapes/rect.tsx:171-176`

```typescript
inferSizeDomains: (shared, children) => {
  return {
    w: computeIntrinsicSize(dims[0].size),
    h: computeIntrinsicSize(dims[1].size),
  };
};
```

The `computeIntrinsicSize()` function returns a `Monotonic` function that maps from data values to pixel sizes. This is used later during layout to determine how much space each element needs.

### Pass 6: Underlying Space Resolution

**Location**: `src/ast/gofish.tsx:176`

```typescript
const [underlyingSpaceX, underlyingSpaceY] = child.resolveUnderlyingSpace();
```

**Implementation**: `src/ast/_node.ts:212-223`

This is one of the most important passes. It determines the **underlying space** type for each dimension, which affects how scales are computed and how axes are rendered.

**Underlying Space Types** (defined in `src/ast/underlyingSpace.ts`):

- **`POSITION`**: Continuous position scale (e.g., `x: value(5)`, `y: value(10)`)
- **`DIFFERENCE`**: Difference scale for stacked/grouped charts
- **`SIZE`**: Size-only encoding (no position)
- **`ORDINAL`**: Discrete categorical scale (e.g., `spread("category")`)
- **`UNDEFINED`**: No data-driven encoding

See [Underlying Space](/internals/core/underlying-space) for the full treatment of this intermediate representation.

**Constraints participate too.** `resolveUnderlyingSpace` passes a node's
positioning constraints to its resolver (a fourth `constraints` argument). A
`layer` folds the _datum_ coordinates of its `Constraint.position` constraints
into a `POSITION` domain on that axis (`collectPositionDomains`), unioned with
the children's spaces — so a `position` constraint contributes a fragment of
this pass, which is what lets the layer build a data→pixel scale to resolve
those constraints at layout time. See
[Operators vs Constraints](/internals/design/operators-vs-constraints).

**Example for Bar Chart Rectangles**:

**Location**: `src/ast/shapes/rect.tsx:92-169`

For a vertical bar chart where:

- X-axis: `spread("category")` → `ORDINAL` space
- Y-axis: `h: "value"` → `SIZE` space (if no min) or `POSITION` space (if min is specified)

The logic in `resolveUnderlyingSpace` checks:

```typescript
if (!isValue(dims[0].min) && !isValue(dims[0].size)) {
  underlyingSpaceX = ORDINAL([]);
} else if (isAesthetic(dims[0].min) && isValue(dims[0].size)) {
  underlyingSpaceX = DIFFERENCE(getValue(dims[0].size)!);
} else if (!isValue(dims[0].min) && isValue(dims[0].size)) {
  underlyingSpaceX = SIZE(getValue(dims[0].size)!);
} else {
  const min = isValue(dims[0].min) ? getValue(dims[0].min) : 0;
  const size = isValue(dims[0].size) ? getValue(dims[0].size) : 0;
  const domain = interval(min, min + size);
  underlyingSpaceX = POSITION(domain);
}
```

### Pass 7: Axis Elaboration

**Location**: `src/ast/gofish.tsx` (`layout()`), `src/ast/axes/elaborate.tsx`

If the chart-level `axes` option enables a dimension, `resolveAxes` walks the
tree top-down flagging which node _owns_ an axis on each dimension,
`resolveNiceDomains` rounds POSITION domains to tick-friendly bounds, and then
`elaborateAxes` **rewrites the tree**: each axis-owning node is wrapped in
`Layer` tiers containing ordinary `rect`/`text`/`spread` axis shapes wired with
`align`/`distribute`/`position` constraints. Axes are not a privileged node
type and there is no axis-specific code later in the pipeline — after this
pass they are just nodes. Because the rewrite inserts new nodes and moves
keys onto wrappers, the affected resolution passes (color, names, labels,
underlying space, nice domains) rerun on the new tree.

See [Axes](/internals/frontend/axes) for the full elaboration story (the
two-tier structure, origin pins, negative-space gutters, and the
continuous/difference/ordinal kinds).

**Axis-title elaboration** follows the axis block (after the nice-space capture)
and runs _before_ the legend. `elaborateAxisTitles` wraps the chart in one more
`Layer` carrying up to two title `Text` nodes — the x-title horizontal below the
plot, the y-title rotated to read bottom-to-top in the left gutter — each
centered on the axis line it describes via a `ref()` stand-in (`elaborateAxes`
hands back those axis-line nodes as `titleAnchors`; an ordinal or absent axis
has no line, so the title falls back to centering on the plot node). Two extra
references thread through here:

- `plotNode` — the original root content, captured _before_ `elaborateAxes`, so
  it survives every wrapping pass and stands in as the fallback title anchor.
- `contentNode` — the node captured _just before_ the title wrap (and so before
  the legend wrap too). It is what `finalW`/`finalH` read off below, so a long
  title or a tall legend can never inflate the inferred canvas; their extents
  past the content are reserved separately as measured gutters instead.

The ordering is deliberate: titles must be seated before the legend, because the
legend distributes off the titled content's bbox — and conversely the title's
centering must never see the legend column (it would drag the title off-center).
This is the same elaborate-into-ordinary-nodes treatment axes and legends get;
the former bespoke render-time title path is gone. See
[Axes](/internals/frontend/axes) for the title recipe and the
sibling-facet anchor limitation.

**Legend elaboration** follows the title block in the same `layout()`, gated on a
non-empty color map (not on the `axes` option). `elaborateLegend` wraps the chart
root in a `Layer` holding the content plus a swatch column of `rect`/`text` rows,
seated to the right with `align`/`distribute` constraints — the same elaborate-
into-ordinary-nodes treatment axes get. See
[Legends](/internals/frontend/legends).

### Pass 8: Position Scale Computation

**Location**: `src/ast/gofish.tsx:183-202`

```typescript
const posScales = [
  underlyingSpaceX.kind === "position"
    ? computePosScale(
        continuous({
          value: [underlyingSpaceX.domain!.min, underlyingSpaceX.domain!.max],
          measure: "unit",
        }),
        w
      )
    : undefined,
  underlyingSpaceY.kind === "position"
    ? computePosScale(
        continuous({
          value: [underlyingSpaceY.domain!.min, underlyingSpaceY.domain!.max],
          measure: "unit",
        }),
        h
      )
    : undefined,
];
```

For `POSITION` spaces, this creates linear scales that map from data values to pixel coordinates. These scales are used during layout to position elements.

### Pass 9: Layout Calculation

**Location**: `src/ast/gofish.tsx:208`

```typescript
child.layout([w, h], [undefined, undefined], posScales);
```

**Implementation**: `src/ast/_node.ts:234-252`

This is where the actual positioning and sizing happens. Each node's `layout` function is called with:

- Available space: `[w, h]`
- Scale factors: `[undefined, undefined]` (computed internally)
- Position scales: `posScales` (for `POSITION` spaces)

It applies layout algorithms (stacking, positioning, etc.), calculates intrinsic dimensions for each node, and handles nested layouts and complex arrangements.

**Inferring an omitted `w`/`h`.** The chart-level `w` and `h` are optional. An
omitted dimension is resolved per axis from that axis's root underlying space:

- A **POSITION** or **data-driven SIZE** axis (a scatter axis, or bar heights
  `= value`) has data to scale into pixels, so it falls back to a concrete canvas
  (`DEFAULT_CANVAS_SIZE = 400`).
- An **ORDINAL** or **UNDEFINED** axis (a bar chart's category axis, or a bare
  fixed-size shape) has nothing to scale, so it lays out _unsized_: marks keep
  their default sizes (a mark treats a non-finite size as "use my default" via its
  `Number.isFinite` guards) and the operator shrinks to fit.

`layout()` therefore distinguishes the concrete `canvasW`/`canvasH` (used to build
the position scales and root scale factors) from the `layoutW`/`layoutH` it hands
to `child.layout` (where a shrink-to-fit axis is left unsized). After layout it
reads the chart's _final_ extent back off the root via `child.dims[i].size`, so an
unsized axis still yields a concrete SVG size (e.g. a no-width bar chart gets
default-width bars and a width of `n·barWidth + spacing`). A user-supplied
dimension is always authoritative. This computed extent — not the raw option — is
what the render pass uses to size the SVG. The legend is now part of the laid-out
tree (it is elaborated into the node tree during layout, see Pass 7), so it is
included in this computed extent when `w`/`h` are omitted. (When a dimension is
shrink-to-fit, Pass 10 pins the content's `min` edge to `0` so it fills `[0, size]`
exactly; the per-side overhangs below then measure `0` on that axis — there is no
gutter to reserve because the canvas already _is_ the content extent.) When a
dimension _is_ given, `layout()` additionally measures how far the laid-out tree
extends past the authoritative extent on each of the four sides — including content a constraint
seated _beyond_ the canvas, e.g. a marginal histogram's bands above and to the
right of a scatter — and the render pass reserves exactly that, replacing the
former fixed `LEGEND_MARGIN` constant. The right side is split into two measured
overhangs: a `rightOverhang` for a legend swatch column (gated on whether a legend
was added) and a `rightContentOverhang` for any non-legend content displaced past
the right edge — see Render Pass 2 below for why the split is necessary. See
[Legends](/internals/frontend/legends).

> Literal pixel sizes are invisible to the underlying-space tree (a fixed-size
> shape resolves to `UNDEFINED`, not `SIZE`), which is why the unsized path relies
> on the marks' default-size guards and the bbox readback rather than reading an
> intrinsic size from the space. Tracking constant sizes in the space system is a
> separate change.

**Example: Rect Layout Function**

**Location**: `src/ast/shapes/rect.tsx:177-250`

For a bar chart rectangle, the layout function:

1. **Computes position** (x, y):

   ```typescript
   const x = computeAesthetic(dims[0].min, posScales?.[0]!, undefined);
   const y = computeAesthetic(dims[1].min, posScales?.[1]!, undefined);
   ```

2. **Computes size** (width, height):

   ```typescript
   // If both min and size are data-driven, compute from position scale
   if (isValue(dims[0].min) && isValue(dims[0].size)) {
     const min = x;
     const max = computeAesthetic(
       value(getValue(dims[0].min)! + getValue(dims[0].size)!),
       posScales[0],
       undefined
     );
     w = max - min;
   } else if (isValue(dims[0].size) && posScales?.[0]) {
     // Size-only: compute from position scale with baseline at 0
     const minPos = posScales[0](0);
     const maxPos = posScales[0](getValue(dims[0].size)!);
     w = maxPos - minPos;
   } else {
     // Use size scale factor
     w = computeSize(dims[0].size, scaleFactors?.[0]!, size[0]);
   }
   ```

3. **Returns intrinsic dimensions and transform**:
   ```typescript
   return {
     intrinsicDims: [
       { min: w >= 0 ? 0 : w, size: w, center: w / 2, max: w >= 0 ? w : 0 },
       { min: h >= 0 ? 0 : h, size: h, center: h / 2, max: h >= 0 ? h : 0 },
     ],
     transform: { translate: [x, y] },
   };
   ```

The `intrinsicDims` represent the element's size in its local coordinate system (with min typically at 0), while `transform.translate` positions it in the parent's coordinate system.

### Pass 10: Placement

**Location**: `src/ast/gofish.tsx`

```typescript
const placeRoot = (axis, value, shrinkToFit) =>
  shrinkToFit
    ? child.pinAnchor(axis, value, "min")
    : child.place(axis, value, "baseline");
placeRoot("x", x ?? transform?.x ?? 0, w === undefined);
placeRoot("y", y ?? transform?.y ?? 0, h === undefined);
```

**Implementation**: `src/ast/_node.ts`

Pins the whole chart into the container by landing one anchor of the root's bbox
at a target coordinate. _Which_ anchor depends on whether the axis is sized:

- **Given dimension** → pin the **baseline** (local `0`) to `0`. The canvas box is
  the baseline-anchored `[0, given]`, and any content seated outside it (axis labels
  below `0`, ticks above `given`) is reserved as the per-side overhangs in the render
  pass.
- **Shrink-to-fit dimension** (`w`/`h` omitted, so `finalH = size`) → pin the **`min`
  edge** to `0`. The canvas box _is_ the content's full `[min, max]` extent, so the
  content fills `[0, size]` exactly and the overhang formulas (`-min`, `max - finalH`)
  compute `0` for that axis with no special-casing.

  Leaving `min` off origin in this case is the
  [#574](https://github.com/gofish-graphics/gofish-graphics/issues/574) double-count:
  a _negative_ `min` (content below/left of baseline) makes `bottomOverhang = -min`
  re-reserve a phantom band ~equal to the offset, so the canvas comes out ~2× the
  content; a _positive_ `min` (a self-placed diagram seated at, say, `(20, 20)`) both
  gaps the near side and overhangs the far side. Pinning `min` to 0 collapses both,
  and it keeps the overhang reservation purely a _given-dimension_ concern.

  The min-pin uses **`pinAnchor`**, not the write-once `place()`: a chart whose root
  carries its own transform (a hand-built diagram like the pulley) has already
  self-placed that axis, and `place()` short-circuits on a placed axis. `pinAnchor` is
  the authoritative override — it rebuilds the axis ledger so the pin lands regardless
  — and for an unplaced root it matches what `place(…, "min")` would have done.

### Pass 11: Ordinal Scale Building

**Location**: `src/ast/gofish.tsx:216-223`

```typescript
const ordinalScales: [OrdinalScale | undefined, OrdinalScale | undefined] = [
  isORDINAL(underlyingSpaceX) && keyContext
    ? buildOrdinalScaleX(keyContext, child)
    : undefined,
  isORDINAL(underlyingSpaceY) && keyContext
    ? buildOrdinalScaleY(keyContext, child)
    : undefined,
];
```

**Implementation**: `src/ast/gofish.tsx:65-119`

For `ORDINAL` spaces, this builds scales that map category keys to pixel positions. The function:

1. Iterates through `keyContext` to find all nodes with keys
2. Computes their final positions (accounting for transforms)
3. Returns a function `(key: string) => number | undefined`

**Example**: In a bar chart with `spread("category", { dir: "x" })`, each bar has a key like `"category-A"`, `"category-B"`, etc. The ordinal scale maps these keys to their x-positions for axis labeling.

## Render Phase

After layout completes, the render phase generates SVG elements.

### Entry Point: The `render()` Function

**Location**: `src/ast/gofish.tsx:346-842`

The render function is called from `gofish()` after layout data is available:

```tsx
return render(
  {
    width: data.width,
    height: data.height,
    svgPadding,
    defs,
    rightOverhang: data.rightOverhang,
    leftOverhang: data.leftOverhang,
    bottomOverhang: data.bottomOverhang,
  },
  data.child
);
```

`render()` no longer takes `axes`/`axisFields` or the scale/space context — all
the chrome is in the laid-out tree by now, so render only needs the computed
extent and the measured per-side overhangs to size the SVG.

### Render Pass 1: Context Restoration

**Location**: `src/ast/gofish.tsx:378-379`

```typescript
scaleContext = scaleContextParam;
keyContext = keyContextParam;
```

The global contexts are restored so that render functions can access them.

### Render Pass 2: Chrome Reservation

**Location**: `src/ast/gofish.tsx` (`render()`)

`render()` draws **no chart chrome of its own** — no axis lines, tick marks, tick
labels, ordinal category labels, _or titles_, and no legend swatches. All of it
was elaborated into ordinary nodes during layout (see Pass 7: Axis Elaboration,
the title block that follows it, and the legend block) and renders as part of the
node tree like any other shape. The former bespoke render-time path (hand-written
`<text>` title elements behind fixed `Y_TITLE_MARGIN` / `X_TITLE_MARGIN` gutters)
has been deleted, so `render()` has zero chart-chrome special cases left.

What `render()` _does_ do is size the SVG around the measured extent of that
chrome, on all four sides. `layout()` hands it five gutter measurements:
`leftOverhang`, `bottomOverhang`, and `topOverhang` (negative-space gutters and
top overflow off the outermost wrapper: tick/label rows, the seated y-title and
x-title, and any content a constraint seated above the canvas), plus the two
right-side overhangs — `rightOverhang` (the legend swatch column) and
`rightContentOverhang` (non-legend content displaced past the right edge). The
render pass reserves exactly enough on each side:

```typescript
const EDGE_GAP = 8; // breathing room between gutter content and the SVG edge
const reserve = (o: number) =>
  o > 0 ? Math.ceil(Math.max(pad, o + EDGE_GAP)) : pad;
const leftReserve = reserve(leftOverhang);
const bottomReserve = reserve(bottomOverhang);
const topReserve = reserve(topOverhang);
// right side: legend column + non-legend displaced content
// width = leftReserve + width + rightOverhang + reserve(rightContentOverhang)
```

The `o > 0` guard keeps a chart with `padding: 0` and no chrome at zero reserve
(don't invent `EDGE_GAP` px on an empty gutter). Because a gutter that fits
within the existing `pad` is absorbed by it, an untitled chart with a small
gutter stays byte-identical to the pre-chrome output. The measured-overhang
policy also fixes a latent bug: the old fixed 40px margins silently _clipped_ any
gutter wider than themselves (long y tick labels, **or content a constraint
seated past the canvas — marginal histogram bands, wide diagram nodes**), whereas
`reserve()` grows to fit whatever the laid-out content actually needs.

**Why the right side is special.** Left, bottom, and top each have a single kind
of overhang (chrome or displaced content) and run through `reserve()` uniformly.
The right side carries _two_ kinds that must be reserved _differently_: a legend
column historically reserves `legendOverhang + pad`, while displaced content
(like a marginal band) should run through `reserve()` like the other gutters. The
two cannot be unified by magnitude — a single-row legend overhangs by roughly the
same few pixels as a wide rightmost x-tick label, yet the legend must be _added_
to the width while the tick spill must be _absorbed_ into `pad`. Only the
color-scale flag (`legendAdded`) can tell them apart, so the legend keeps its own
gated `rightOverhang` term; everything else flows through `rightContentOverhang`
and `reserve()`. This is the one place a chart-chrome flag still influences
sizing — kept deliberately, because the distinction is semantic, not geometric.

### Render Pass 3: SVG Container Creation

**Location**: `src/ast/gofish.tsx` (`render()`)

```typescript
<svg
  width={leftReserve + width + rightOverhang + pad}
  height={pad + height + bottomReserve}
  xmlns="http://www.w3.org/2000/svg"
>
```

The SVG container is sized to the content (`width`/`height`, read off the
pre-chrome content node in layout) plus the measured reserves on each side.

### Render Pass 4: Coordinate Transform

**Location**: `src/ast/gofish.tsx` (`render()`)

```typescript
<g transform={`scale(1, -1) translate(${leftReserve}, ${-(height + pad)})`}>
```

The coordinate system is flipped (Y-axis inverted) to match mathematical
conventions, and the chart is shifted right by `leftReserve` (the left gutter)
and down by the top `pad`.

### Render Pass 5: Node Tree Rendering

**Location**: `src/ast/gofish.tsx:419-421`

```typescript
<Show when={transform} keyed fallback={child.INTERNAL_render()}>
  <g transform={transform ?? ""}>{child.INTERNAL_render()}</g>
</Show>
```

The node tree is rendered recursively via `INTERNAL_render()`.

**Implementation**: `src/ast/_node.ts:315-332`

```typescript
public INTERNAL_render(
  coordinateTransform?: CoordinateTransform
): JSX.Element {
  return this._render(
    {
      intrinsicDims: this.intrinsicDims,
      transform: this.transform,
      renderData: this.renderData,
      coordinateTransform: coordinateTransform,
    },
    this.children.map((child) =>
      child.INTERNAL_render(
        this.type !== "box" ? coordinateTransform : undefined
      )
    )
  );
}
```

### Render Pass 6: Shape-Specific Rendering

Each shape type has its own render function. For rectangles, this is in:

**Location**: `src/ast/shapes/rect.tsx:251-449`

The rect render function handles three cases based on which dimensions are data-driven:

#### Case 1: Both Dimensions Aesthetic (Point-like)

**Location**: `src/ast/shapes/rect.tsx:298-322`

When neither dimension is embedded (data-driven), the rect is rendered as a transformed point:

```typescript
if (!isXEmbedded && !isYEmbedded) {
  const center: [number, number] = [
    (displayDims[0].min ?? 0) + (displayDims[0].size ?? 0) / 2,
    (displayDims[1].min ?? 0) + (displayDims[1].size ?? 0) / 2,
  ];
  const [transformedX, transformedY] = space.transform(center);
  // ... render rect at transformed position
}
```

#### Case 2: One Dimension Data-Driven (Line-like)

**Location**: `src/ast/shapes/rect.tsx:325-399`

When one dimension is embedded (e.g., bar height in a bar chart), the rect is rendered as a line or path:

```typescript
if (isXEmbedded !== isYEmbedded) {
  const dataAxis = isXEmbedded ? 0 : 1;
  const aestheticAxis = isXEmbedded ? 1 : 0;
  const thickness = displayDims[aestheticAxis].size ?? 0;

  // For linear spaces, render as simple rect
  if (space.type === "linear") {
    // ... render rect with data-driven dimension
  } else {
    // For non-linear spaces, render as path
    const linePath = path([...], { subdivision: 1000 });
    const transformed = transformPath(linePath, space);
    return <path d={pathToSVGPath(transformed)} ... />;
  }
}
```

**Example**: In a vertical bar chart:

- X-axis is aesthetic (spread by `spread()` operator)
- Y-axis is data-driven (`h: "value"`)
- Each bar is rendered as a rectangle with fixed width and data-driven height

#### Case 3: Both Dimensions Data-Driven (Area-like)

**Location**: `src/ast/shapes/rect.tsx:401-449`

When both dimensions are embedded, the rect is rendered as an area:

```typescript
// If we're in a linear space, render as a rect element
if (space.type === "linear") {
  // ... render rect
} else {
  // For non-linear spaces, render as transformed path
  const corners = path([...], { closed: true, subdivision: 1000 });
  const transformed = transformPath(corners, space);
  return <path d={pathToSVGPath(transformed)} ... />;
}
```

### Render Pass 7: Axis Rendering (removed)

The bespoke axis-rendering pass that used to live here (hand-written SVG for
continuous/ordinal axes, ~400 lines of `gofish.tsx`) was **deleted**. Axes are
now elaborated into ordinary GoFish nodes during layout (see Pass 7: Axis
Elaboration and [Axes](/internals/frontend/axes)), so they render through the
normal node-tree pass above with no special casing. Axis **titles** were the
last artifact still drawn here; they too are now elaborated during layout
(see Render Pass 2), so nothing axis-related is drawn directly at render time.

### Render Pass 8: Legend Rendering (removed)

The bespoke legend-rendering pass that used to live here (a `<For>` over
`scaleContext.unit.color` hand-placing swatches behind a fixed `LEGEND_MARGIN`)
was **deleted**. Color legends are now elaborated into ordinary GoFish nodes
during layout (see Pass 7: Axis Elaboration, which the legend pass follows, and
[Legends](/internals/frontend/legends)), so they render through the normal
node-tree pass above with no special casing.

## Complete Example: Bar Chart Rendering

Let's trace through a complete bar chart example:

```typescript
barChart(data, {
  x: "category",
  y: "value",
  orientation: "y",
});
```

### Step 1: Chart Construction

**Location**: `src/charts/bar.ts:88-97`

```typescript
const builder = chart(data)
  .flow(spread("category", { dir: "x" }))
  .mark(rect({ h: "value" }));
```

This creates:

- A `chart` node with the data
- A `spread` operator that groups by "category" and spreads along x
- A `rect` mark with height driven by "value"

### Step 2: Layout Passes

1. **Color Resolution**: No colors specified, so this is a no-op
2. **Key Resolution**: Each bar gets a key like `"category-A"`, `"category-B"`, etc.
3. **Size Domain Inference**: For each rect, `inferSizeDomains` returns a monotonic function for height
4. **Underlying Space Resolution**:
   - X-axis: `ORDINAL` (from `spread`)
   - Y-axis: `SIZE` (height is data-driven, no position)
5. **Axis Elaboration** (if `axes` enabled): the chart is wrapped in layers
   carrying the y tick marks/labels (constraint-pinned at their data values)
   and the per-category x labels (`ref`-bound to the bars)
6. **Layout Calculation**:
   - X-positions computed by `spread` operator (ordinal spacing)
   - Y-positions set to 0 (bars start at baseline)
   - Heights computed from data values using size scale factors
7. **Ordinal Scale Building**: Maps category keys to x-positions

### Step 3: Render Pass

1. **Rect Rendering**: Each bar is rendered using Case 2 (one dimension data-driven):

   ```typescript
   // X is aesthetic (positioned by spread), Y is data-driven
   const baseX = displayDims[0].min ?? 0;
   const baseY = 0; // Baseline
   const width = displayDims[0].size ?? 0; // Inferred by spread
   const height = displayDims[1].size ?? 0; // From data

   return <rect x={baseX} y={-baseY - height} width={width} height={height} ... />;
   ```

2. **Axes**: already part of the node tree (elaborated during layout), so
   the category labels, the y tick marks, and the axis titles all render in
   step 1 with everything else — nothing axis-related is drawn separately

## Debug Support

The system includes debugging capabilities. When the `debug` option is set:

```typescript
if (debug) {
  debugNodeTree(child);
  console.log("scopeContext", scopeContext);
}
```

- **Node Tree Debugging**: Visualizes the complete chart tree structure
- **Context Logging**: Outputs all context information for inspection
- **Development Aid**: Helps identify layout issues and optimization opportunities

## Performance Considerations

- **Single Traversal**: Each pass traverses the tree only once when possible.
- **Per-run sessions**: Contexts are scoped to a single render session and discarded afterward, so there is no leakage between renders.

## Key Takeaways

1. **Layout is separate from rendering**: All spatial calculations happen in the layout phase
2. **Underlying space determines scale types**: The underlying space resolution pass is critical for determining how to scale and render
3. **Keys enable axis labeling**: The key resolution pass enables ordinal axes to find and position category labels
4. **Rendering adapts to coordinate spaces**: The rect render function adapts its rendering strategy based on which dimensions are data-driven and what coordinate transform is active
5. **Contexts flow through passes**: The three session contexts (scope, scale, key) are populated during layout and used during rendering

## Code References Summary

- **Main entry point**: `src/ast/gofish.tsx`
- **Node implementation**: `src/ast/_node.ts`
- **Rect shape**: `src/ast/shapes/rect.tsx`
- **Bar chart helper**: `src/charts/bar.ts`
- **Underlying space types**: `src/ast/underlyingSpace.ts`
