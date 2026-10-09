---
title: Overview
section: Layout & Rendering
order: 50
group: Layout
status: draft
covers:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/ast/axisDirection.ts
  - packages/gofish-graphics/src/ast/shapes/rect.tsx
  - packages/gofish-graphics/src/ast/perf.ts
  - packages/gofish-graphics/src/ast/geometry/index.ts
  - packages/gofish-graphics/src/ast/graphicalOperators/pack.tsx
  - packages/gofish-graphics/src/ast/graphicalOperators/overlap.ts
  - packages/gofish-graphics/src/ast/constraints/overlap.ts
---

# Layout and Render Passes in GoFish Graphics

This document explains the order and mechanics of layout and render passes in the GoFish graphics system, with specific examples and code references.

## Overview

The GoFish rendering pipeline transforms a declarative chart specification into a rendered SVG visualization through a series of well-defined passes. The process can be divided into two main phases:

1. **Layout Phase**: Computes positions, sizes, and spatial relationships
2. **Render Phase**: Lowers the laid-out tree into a flat display-list IR, then
   paints that IR with a backend (SVG today)

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
      { w, h, x, y, transform, debug, defs, axes },
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

The chart builders do one thing between resolving a chart and handing it to
`gofish()`: they install the build-in (`installBuildIn` in
`src/animation/install.ts`, called from `resolveForRender`). It reads the
transitions off the resolved tree, checks each one's phases against the clock
that plays it, solves the enter timing, and puts every animated mark on one
clock for the chart. The timing depends on the tree's structure and data, not on
layout, so it is read before the chrome passes below add axes and legends, which
therefore appear at once. The builders' render options `playing` and `at` hold
that clock, as the options of the same names hold a `time.sequence`'s.

## Layout Phase

The layout phase is handled by the `layout()` function, which performs multiple passes over the chart tree.

### Pass 1: Context Initialization

**Location**: `src/ast/gofish.tsx:272-275`

Three per-run session contexts are initialized:

- **`scopeContext`**: Manages variable scoping and data bindings (type: `Map`)
- **`scaleContext`**: Stores computed color scales and scale mappings (type: `{ unit: { color: Map<any, string> } }`)
- **`keyContext`**: Maps string keys to nodes for axis labeling (type: `{ [key: string]: GoFishNode }`)

These are attached to the render session and propagated to the node tree, rather than stored as module-global mutable state. This establishes clean state for the rendering process and ensures no interference between multiple chart renders.

Calendar math (a time axis's cells) runs synchronously during elaboration,
on the Temporal API that `applySchema` (`schema.ts`) loads when the chart's
data has a time column (`loadTemporal()` in `calendar.ts`): the native API
where the runtime has one, else `temporal-polyfill`, imported only then. A
time axis needs a time column, so `layout` itself loads nothing, and a chart
without one never loads the polyfill.

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

### Pass 5.5: Axis-Name Resolution

**Location**: `src/ast/gofish.tsx` (`child.resolveAliases()`), `src/ast/_node.ts`
(`resolveAliases`)

`x`/`y`/`w`/`h` mean axis 0 and axis 1 in every coordinate space. A coordinate
transform may also declare **names** for its two axes in its `aliases` field:
`Coord.polar()`/`Coord.clock()` declare `{ x: "theta", y: "r" }` and `Coord.geo()` declares
`{ x: "lon", y: "lat" }`. That declaration is the only source of the names. They are
used in two places, and in both the meaning of a name depends on where the node sits,
which a factory does not know when it runs:

- a box-dims mark's `dims` option, keyed by axis name (`rect({ dims: { theta: { size:
0.4 } } })`), and a treemap's `dims` for its own box. Channel inference has already
  run on it at build time: a mark gives each slot a kind by its structure (`size` is
  a size channel; a bare value, `min`, `center`, `max` are positions), and an
  operator gives each slot the channel of its top-level counterpart. Neither depends
  on the axis, so `mapAxisDims` applies it before the axis is known.
- an operator's `dir` (spread, stack) and a scatter's `dims`. Everything in these
  operators that needs the axis (the align/distribute or position constraints and
  `axisDir`) waits for the axis, and so do the constraints `.relate()` installs.
  Spread's per-entry `size` wrapper uses a `dims` option keyed by `dir`, so it
  resolves in the same pass.

Both kinds of work are deferred the same way: the factory sets one hook on the
node, `_elaborateInAxisScope(outer, inner)`. `outer` is the scope the node's own box
lives in (its parent's scope, even on a coord) and `inner` is the scope of its
children. A mark's hook (`deferAxisDims` in `dims.ts`) writes its `dims` bag onto its
per-axis dims array against `outer` with `applyAxisDims`. An operator's hook resolves
its names against `inner` and calls `.relate()`, which is async. A spread given its
own `dims` runs the layer's dims hook first, then its own.

`resolveAliases` is a top-down pass (run before underlying space, which reads the
dims and the constraints) that carries the **axis scope**, whose `names` map each name to an axis,
starting at `{ x: 0, y: 1 }`. Every `coord` replaces the scope for its subtree with
`x`, `y`, and the names its transform declares. Most transforms (`linear`, `wavy`,
`bipolar`, `arcLengthPolar`) declare none, so inside them only `x`/`y` are visible:
a name has a meaning only inside the space that declares it, and the innermost coord
wins. A coord declares its space on its node (`_space`: the transform's `aliases`
and `type`). The scope also carries `warpedBy`, the type of the nearest enclosing
space that is not linear, for work that is only correct in a linear one (scatter's
`overlap`). The walk is synchronous: it queues each node's hook with its two scopes, in
pre-order. The pass then runs the queue one hook at a time, in
that order. It does not run them concurrently, because an operator's `.relate()`
walks the subtree to build its environment and must not interleave with a
descendant's hook. The walk sees the tree before any hook runs; that is enough,
because spread's and scatter's `.relate()` return constraints only and add no nodes.
A name the scope does not declare **throws**, listing the names it does; so does
setting one (axis, anchor) slot twice, across the top-level keys and `dims` or within
`dims`. Scatter merges its top-level `x`/`xMin`/`xMax` (and `y` ones) with its `dims`
through the same `mergeAxisDims` as the marks, with its own rules: a bare value is
the point (`center`), and `size` is not a key. A span is checked on the merged axis,
so `xMin` with `dims.x.max` is a span, and one end without the other throws, from
either spelling. Like the later embedding pass it
mutates the per-axis dims array by reassigning its elements, so the captured
layout/space closures observe the result.

A hook is cleared once it has run to completion, so the pass is idempotent. A hook
that throws stays, and so do the hooks queued after it, so a rerun reports the same
error instead of skipping work. That lets `gofish.tsx` rerun it
after axis, title, and legend elaboration, whose chrome is built from `Spread` nodes
that install their constraints in this pass. See
[Authoring Coordinate Transforms](/internals/layout/coordinate-transforms).

### Pass 6: Underlying Space Resolution

**Location**: `src/ast/gofish.tsx:176`

```typescript
const [underlyingSpaceX, underlyingSpaceY] = child.resolveUnderlyingSpace();
```

**Implementation**: `src/ast/_node.ts:212-223`

This is one of the most important passes. It determines the **underlying space** type for each dimension, which affects how scales are computed and how axes are rendered. A second walk over the same tree, `resolveExtent()`, then computes each continuous dimension's **size claim** (an `Extent`: σ-affine `ascent`, `descent`, and `width` Monotonics) from the children's claims and the already-resolved types. Types never read claims; layout reads both.

**Underlying Space Kinds** (defined in `src/ast/underlyingSpace.ts`). Since the
#586 collapse there are only three _kinds_ — `continuous`, `ordinal`,
`undefined` — and the old POSITION / DIFFERENCE / SIZE trichotomy is now three
**`origin` states** of the single `continuous` kind (read via the
`originOf(space)` read):

- **`CONTINUOUS`**: one data-driven extent, a signed `dataInterval` in data
  units about its local origin plus an `origin` state:
  - `origin: "pinned"` — **POSITION**: the interval is the absolute data
    domain (e.g. `x: value(5)`); builds a position scale (niced per σ-scope at
    the scope's solve, when an axis views the scope — issue #659), absolute
    axis.
  - `origin: "free"` — **SIZE**: a baseline magnitude, sized but unplaced (e.g.
    `h: "value"` with no min), `[−descent, ascent]` about its baseline; no
    position scale.
  - `origin: "none"` — **DIFFERENCE**: unanchorable, only differences are
    meaningful (stacked/centered); delta axis over `[0, width]`.
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
- Y-axis: `h: "value"` → `SIZE` space (if no min) or `POSITION` space (if min is specified).
  The `SIZE` space is `CONTINUOUS(interval(0, value), "free")`: the value's positive part is its
  ascent and its negative part its descent, so a negative bar extends below
  its baseline. A rect writes no claim hook, so its claim is the one its type
  implies: `value·σ` on the matching side.

The logic in `resolveUnderlyingSpace` checks:

```typescript
if (!isValue(dims[0].min) && !isValue(dims[0].size)) {
  underlyingSpaceX = ORDINAL([]);
} else if (isAesthetic(dims[0].min) && isValue(dims[0].size)) {
  underlyingSpaceX = CONTINUOUS(interval(0, getValue(dims[0].size)!), "none");
} else if (!isValue(dims[0].min) && isValue(dims[0].size)) {
  underlyingSpaceX = CONTINUOUS(interval(0, getValue(dims[0].size)!), "free");
} else {
  const min = isValue(dims[0].min) ? getValue(dims[0].min) : 0;
  const size = isValue(dims[0].size) ? getValue(dims[0].size) : 0;
  const domain = interval(min, min + size);
  underlyingSpaceX = CONTINUOUS(domain, "pinned");
}
```

### Pass 7: Chrome Elaboration

**Location**: `src/ast/gofish.tsx` (`layout()`), `src/ast/axes/elaborate.tsx`

If the chart-level `axes` option enables a dimension, `resolveAxes` walks the
tree top-down flagging which node _owns_ an axis on each dimension. Ownership
records a **signature** per claimed dim: a continuous axis claims it opaquely
(single-owner — the root-most one wins, descendants defer to the chart-level
scale), but ordinal axes **nest** — a node claims its own ordinal axis even
under an ancestor ordinal axis, as long as it is a _different_ grouping (a finer
level). So a grouped or faceted chart renders one ordinal axis per grouping
level (per facet) — e.g. a `spread(lake)`+`stack(species)` bar gets an outer
`lake` axis and a per-lake `species` axis. Wherever it sets an owning flag,
`resolveAxes` also leaves a persistent `axisDemand` stamp — the axis's ticks
(`AxisTicks`: a count, and a time axis's rows), which later gate and
shape per-scope domain nicing at the σ-scope solves (issue #659), since
`resolveNiceDomains`'s old per-node tree walk is gone; nicing is now demand-
driven at each scope's own solve (below). Then
`elaborateChrome` **rewrites the tree**. Each node that owns chrome (axes,
axis titles, a legend) is wrapped in rings of `Layer`s containing ordinary
`rect`/`text`/`spread` shapes wired with `align`/`distribute`/`position`
constraints. Chrome is not a privileged node type, and there is no
chrome-specific code later in the pipeline. After this pass it is just nodes.
Because the rewrite inserts new nodes and moves keys onto wrappers, the name,
alias, and underlying space passes rerun on the new tree. The color scale does
not: it was final before the pass, and chrome adds no data colors. Label
elaboration follows and reruns the same passes. Domain nicing is not a tree pass at
all: each σ-scope nices its own POSITION domain at its solve, if some node in
its space-flow region renders that dim's axis.

See [Axes](/internals/frontend/axes) for the full elaboration story (the
two-tier structure, origin pins, negative-space gutters, and the
continuous/difference/ordinal kinds).

The chart's options describe the chrome of the chart root. `layout()` passes
`elaborateChrome` two answers that apply only to the root:

- **Axis titles.** The root titles each axis it owns that the `axes` option
  turns on. The title text is the option's `title`, or else the axis's
  `measure` (a continuous axis names itself by its unit, an ordinal axis by its
  grouping field). A space with no measure has no title. The measure is read
  off the root's space before elaboration re-resolves it, so the title names
  the OUTERMOST grouping (`lake`, not the inner `species`).
- **The legend.** The color scale is resolved once, from the root, so the root
  carries the legend whenever the scale has something to show and the `legend`
  option is not `false`.

Each title is a ring seated past the root's axes and centered on the axis line
it describes. The legend is the ring outside that, so it is seated past the
titles. The outermost ring records the boxes inside it as `GoFishNode.chrome`:
`content` (the root without chrome) and `withAxes` (the root with its axis
gutters and category label rows). `layout()` uses `withAxes` as the root's
frame: its size is the inferred canvas when `w`/`h` are omitted, and its axis
direction is the root's. So a long title or a tall legend never inflates the
inferred canvas, and their extents past it are reserved as measured gutters.
See [Axes](/internals/frontend/axes) and [Legends](/internals/frontend/legends).

### Pass 8: Position Scale Computation

**Location**: `src/ast/gofish.tsx` (`layout()`), `src/ast/solver/scopes.ts`

```typescript
let rootScopes = [
  scopes.solveScope(meta(0), rootSpaces[0], rootClaims[0], canvas[0]),
  scopes.solveScope(meta(1), rootSpaces[1], rootClaims[1], canvas[1]),
];
```

For every continuous root axis, `solveScope` solves σ from the axis's size
claim against the canvas (`claim.width(σ) = canvas`), so pixel overhead such
as spacing keeps its pixels, and, when the axis has an origin, the pixel of
data 0 (`originPx`). A pinned axis hands its content the map
`px(d) = σ·d + originPx`; a free root is placed at `originPx`.

### Pass 8.5: Embedding Resolution

**Location**: `src/ast/gofish.tsx` (`child.resolveEmbedding()`), `src/ast/_node.ts`
(`resolveEmbedding`)

`resolveEmbedding` is the **sole author** of each dim's `embedded` flag — the
flag the shape renders switch on for point (0 embedded axes) / line (1) / area
(2). It runs top-down after underlying space resolves and before layout, and
mutates the shared `args.dims` element in place (like `resolveAliases`) so the
captured render closure observes it. Explicit `emX`/`emY` (and `connect`'s
`embed()`) lock the flag to `true` and are never recomputed.

A dim embeds iff its size is a data value or unsized (`baseEmbedded`, `data.ts`)
AND — the **Route B** measure gate, only inside a coordinate space — its size's
measure matches the dim's own _position_ measure (`min`/`center`/`max`). A size
in a measure _foreign_ to where the mark sits (a scatter bubble's area ≠ its
position units) stays ink: a flat point at the mapped center, not a swept wedge.
The discriminator is mark-local because a polar coord forgets its axis measure;
a positioned mark's own position measure is the axis measure it sits on. This
consumes the measure provenance #534 carried to mark channels. The revocation is
coord-scoped, so Cartesian behavior matches the former construction-time
inference. (Route A — relational, measure-free embedding — is not yet
implemented; tracked under #618.)

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

#### Axis direction

Layout stores every node's geometry (its local box, its translate, its bbox ledger)
in **y-down pixels**, the canvas's own frame. Nothing is mirrored later. What makes a
continuous y grow upward is the node's **axis direction** (`yDirection(node)` in
`src/ast/axisDirection.ts`), the one resolution site for which way a node's axis
order runs on the screen. Only y has one to resolve; x always runs with the pixels:

- `+1`: the order runs with the pixels. Every x axis, and a discrete y (an ordinal
  space, or a spread along y, whose space is UNDEFINED when its children carry no
  keys): the first item is at the top.
- `-1`: the order runs against the pixels. A continuous y (a value axis, a magnitude,
  a datum-positioned mark) grows upward from its origin, so `start`, the baseline and
  the first part of a stack sit at the bottom.
- A node with **no y axis** (an UNDEFINED y: a fixed-size shape, a text label, a layer
  of those) has no direction of its own and takes its parent's: it reads in the frame
  it sits in. On the canvas that is top-down; inside a bar chart a fixed-size shape's
  box sits above its origin like the bars around it.

A text is a box, placed exactly as a rect of the same size would be: its origin is
its box's start edge in its own axis order (the top in a frame that reads top-down,
the bottom in one that grows upward), so `y`, a parent's seating and every operator
treat it as they treat a rect. The glyphs' own anchor (the point on the baseline that
`textAnchor` and `rotate` refer to) sits inside that box; the text lowers it from
the origin by `glyphDy`, the box's top in pixels less the glyphs' top.

It is read off the node's own resolved underlying space (for a node that roots its
own σ-scope, the space it keeps for itself, `selfScaledSpace`), so it is local: an
ordinal spread inside a bar chart reads top-down inside, and a bar chart inside an
ordinal spread grows upward inside its row. A `coord` and everything inside it is
`-1`, because a coordinate transform is math-handed; the `coord` reflects y where its
interior meets the canvas (see
[Flattening the Scenegraph](/internals/layout/coord-flattening)). A `ref` takes its
target's direction.

Each node resolves its direction once, top-down, into `GoFishNode.yFrame` (the
direction plus whether the node is in a coordinate space), from its resolved spaces
and its parent's frame. The frame is cleared with the spaces
(`clearUnderlyingSpace`), which every rewrite of the tree re-resolves; reading it
before the node's spaces are resolved is an error.

Operators never consult it directly. A node's `_layout` reasons in its own **axis
order** (`order = direction · pixel`), and `GoFishNode.layout` converts at the node
boundary, so spread, stack, align, distribute, the σ maps and baseline seating all run
unchanged:

- the box and translate a `_layout` returns are stored in pixels (`orientDims`,
  `orientTransform`);
- the y map a node receives is reflected when it and its parent run opposite ways
  (`orientScales`; σ, a magnitude, never changes);
- the node is handed back to its parent as a view in the PARENT's axis order
  (`orientView`), which reflects every y read (box, anchors, translate, shape) and
  every y write (placements, extents) about the parent's local origin. Anchors swap
  `min`↔`max` (`orientSide`); `center` and `baseline` stay. The view is built once
  per child, and its reflected shape is rebuilt only when the child's own is.

A `ref` stores a pixel copy of its target, so it is read through its parent's view
like any child. An elaboration wrapper (axes, labels, titles, a legend) builds its
constraints before its own space is resolved, so it reads its direction off
`wrapperDirection(node)`: the direction of a layer that reports the wrapped node's
spaces and takes its parent. A side named on the screen (the top, the bottom) is
turned into the side in a frame's axis order by `orientSide("start" | "end",
direction)`. Geometry a node keeps for its own `lower` (a connector's paths, an
arrow, a polygon's vertices, a tween's run) is in its axis order too; `lower`
receives one node-local map, `local` (`p ↦ translate + (x, direction·y)`), the one
place that geometry is reflected. A node that runs a pixel-native algorithm (the
treemap's d3 tiling, pack's `packSiblings`) places its children in its own axis
order like any operator, with no reflection of its own. A treemap or pack with no
data-driven size has no y axis, so it takes its frame's direction: in free space
d3's first tile lands at the top left, as in d3; in a chart whose y grows upward
it lands at the bottom left.

Seating a child at its baseline is the one place a boundary between two directions
needs more than the reflection: a child whose y grows upward inside a layer that
reads top-down is seated at the bottom of the band the layer allocated it (or of
its own box when unsized), its own start end, exactly as the root sits in the
canvas (`placeRoot`, `fromFrameStart`). So a bar chart in a cell of a layer that
reads top-down sits with its baseline at the bottom of its cell. Every other child
is seated by its origin at the seat. That is not one rule "each child at its own
start end of its band": a child that reads top-down inside a layer whose y grows
upward is still seated at the seat, the band's bottom, not at the band's top. Such
children are placed by what they hold (a value label's `spread` around a `ref` to
its bar); seating them at the band's top lifts them off their bars.

A chain of baselines (a spread with `anchor: "baseline"`) starts at its first
member's origin rather than its start edge (its sequence origin in
`solveAxisProblem`), so two such chains over the same rows solve to the same lines
whatever their rows hold: a ridgeline's upward-growing silhouettes and its rules.

**Inferring an omitted `w`/`h`.** The chart-level `w` and `h` are optional. An
omitted dimension is resolved per axis from the root's size claim on it:

- An axis with a **claim** (a scatter axis, bar heights `= value`, or bar
  widths `= value` laid side by side, whose spread is ordinal but whose room is
  σ-dependent) has data to scale into pixels, so it falls back to a concrete
  canvas (`DEFAULT_CANVAS_SIZE = 400`).
- An axis with **no claim** (a bar chart's category axis, or a bare
  fixed-size shape) has nothing to scale, so it lays out _unsized_: marks keep
  their default sizes (a mark treats a non-finite size as "use my default" via its
  `Number.isFinite` guards) and the operator shrinks to fit.

`layout()` therefore distinguishes the concrete `canvasW`/`canvasH` (used to build
the position scales and root scale factors) from the `layoutW`/`layoutH` it hands
to `child.layout` (where a shrink-to-fit axis is left unsized). **Shared-measure
equal scale** (#582) adds one reconciliation step here, after the per-axis scales
are built and before `child.layout`: when `spaceUnit(x).unit === spaceUnit(y).unit`
(the two axes are the same unit), each axis's pixels-per-data-unit — a POSITION
domain's `canvas / range` or a baseline-magnitude σ — is equated to the binding
`min(...)` so one data unit measures the same on both axes (circles stay circular,
maps stay undistorted); the binding axis fills, the other gets a recentered
posScale. Stage 6c makes this a named `recenterEqualMeasure` operation _on_ the
scope registry rather than an inline rewrite, so it is the one post-solve σ
adjustment on the registry's books and `GOFISH_DUMP_SCOPES` records the final σ.
It is type equality, not a knob, and a single-coordinate-space coupling
— it does not reach sizes solved in separate nested operator scopes. After layout it
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
former fixed `LEGEND_MARGIN` constant. With the right overhang it reports
whether the root carries a legend (`hasLegend`), which decides how the right side
is reserved — see Render Pass 1 below for why. See
[Legends](/internals/frontend/legends).

> Literal pixel sizes are invisible to the underlying-space tree (a fixed-size
> shape resolves to `UNDEFINED`, not `SIZE`), which is why the unsized path relies
> on the marks' default-size guards and the bbox readback rather than reading an
> intrinsic size from the space. Tracking constant sizes in the space system is a
> separate change.

**Example: Rect Layout Function**

**Location**: `src/ast/shapes/rect.tsx:138-269`

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
     intrinsicDims: {
       0: {
         min: Math.min(0, w),
         size: Math.abs(w),
         embedded: dims[0].embedded,
       },
       1: {
         min: Math.min(0, h),
         size: Math.abs(h),
         embedded: dims[1].embedded,
       },
     },
     transform: { translate: [x, y] },
   };
   ```

The `intrinsicDims` represent the element's box in its local coordinate system (with min typically at 0, or at the negative endpoint of a negative bar), while `transform.translate` positions it in the parent's coordinate system. The node's `dims` compose the two exactly once (`combineDims`: `min = local min + translate`), so a layout must never fold its translate into `intrinsicDims.min` as well; doing so counts the offset twice (#755).

#### Shape geometry after layout

Once a node is laid out, `node.geometry()` describes its shape in the same
local frame as `intrinsicDims`, with no translate applied (`src/ast/geometry/`).
The result always has a `box`, which is `intrinsicDims` as a plain box. It may
also answer optional queries. The only query today is `enclosingCircle`. A
consumer calls the helper `enclosingCircle(g)`, which falls back to the circle
through the box corners when the node does not answer.

- A node definition may pass a `geometry` function next to `lower`. `ellipse`
  answers with the circle of its larger radius, and `polygon` answers with the
  smallest circle through its ring.
- A node with children and no `geometry` function answers `enclosingCircle`
  lazily. It takes the smallest circle around its children's circles, each
  moved by the child's translate into the node's frame.
- `GoFishNode` computes `geometry()` on the first call and keeps the result.
  `layout()`, and any later write to the local box (`place` recording a local
  `min`, `setExtent`, `setSizeOnly`), clears it. Calling `geometry()` before
  layout throws.
- A `ref` and a nested constraint operand return their target's geometry,
  because they share its local frame.

The `pack` operator (`graphicalOperators/pack.tsx`) is the first consumer. It
lays out each child, reads `enclosingCircle(child.geometry())`, runs d3's
`packSiblings`, and places each child so its circle lands where d3 put it.
Geometry exists only after layout, so a parent cannot yet read it while sizing.
That is why `pack` keeps its children at their pixel size and does not fit
itself to the space it is given (#967). The design note is
`internals/design/shape-geometry.md` on the geometry-representations branch.

The second consumer is `scatter`'s `overlap` option, `Overlap.separate()` (#969) or
`Overlap.noise()` (#970, #1014). `Overlap.sina()` and `Overlap.jitter()` are `Overlap.noise()` with other
defaults filled in, so they reach layout as the same `{kind: "noise"}` object.
`scatter` elaborates to a layer with a `position` constraint per child on each
axis a field places, and an `align` on every other ("free") axis. With an
overlap strategy, the free axis gets an `overlap` constraint
(`constraints/overlap.ts`) in place of the `align`. It is not a difference
constraint, so the placement solver never sees it: `applyConstraints` runs it
after the solve, when each child's position on the data axis is known. It reads
each child's `enclosingCircle`, asks the strategy
(`graphicalOperators/overlap.ts`) for each circle center's offset from the
alignment line, and pins each child there. A strategy returns one free-axis
number per child, so it cannot move the data axis. `applyConstraints` also
passes the data axis's pixels per data unit (the layer's position-scale
`sigma`), which `noise` needs to turn a `smoothing` bandwidth in data units
into pixels. `smoothing: 0` (the default), `smoothing: Infinity` and
`smoothing: "silverman"` need no scale. 0 and Infinity are the same in any
unit. Silverman's rule reads the dots' own pixel positions, and on a linear
axis the rule in pixels is the rule in data units times the scale. The
strategies share one broad phase, `NeighborGrid`, a uniform grid of square
cells kept as lists in insertion order: `separate` buckets placed dots on the
data axis, and `noise`'s `"blue"` on both axes. `separate` merges each dot's
blocked intervals into disjoint runs in one sorted sweep and takes the nearest
free candidate. `noise`'s outline (`noiseOutline`) is a Gaussian density
estimate in two steps. First each dot is blurred by a bell of the
`smoothing` bandwidth `s`, which estimates where the data is. Then each dot is
blurred by its own footprint, a bell of `σ_dot = pitch/√(2π)` whose peak is
one dot spread over one dot width. Gaussians compose by adding variances, so
each dot adds one bell with `σ = √(σ_dot² + s²)`, and the outline follows the
sum. The bells are summed on a grid, not pair by pair:
each dot's weight is split between its two nearest grid points, the grid is
convolved with the bell cut off at four bandwidths, and each dot reads the sum
back by linear interpolation, the way R's `density()` bins. At the ends of the
data range the sum is divided by the part of the smoothing bell (bandwidth
`s`, not `σ`) at that point that lies inside the range, so a cut off bell
does not thin the ends; this keeps the outline's total size about the same
for every bandwidth. The footprint step is not corrected, since it is the
dot's size, not missing data. With `s = 0` (the
default, and what Silverman's rule gives for fewer than two dots or equal
values) the bell is the footprint alone and nothing is corrected, so a lone
dot sits on the line even at the end of the range. The footprint is the
smallest blur, since a smaller bell would let dots with nearly equal values
draw on top of each other. A scatter with an overlap strategy reports no
size on its free axis in the space pass (a fixed-pixel dot's space is
`UNDEFINED` there), and its real extent comes from where the children land, in
the layer's box fold, the way a text label's extent is measured at layout.
So a beeswarm takes the room its dots need and does not shrink to fit. It throws
inside a non-linear coordinate space, where the layout frame is not the screen
(#1002); the axis scope the scatter elaborates in carries the nearest
non-linear space (`AxisScope.warpedBy`), so the scatter can tell.

### Pass 10: Placement

**Location**: `src/ast/gofish.tsx`

```typescript
// The root's axis order starts at the canvas frame's start edge: the top, or the
// bottom for a continuous y (`direction` −1).
const atFrameStart = (p) => (direction === 1 ? p : frame - p);
shrinkToFit
  ? child.pinAnchor(axis, atFrameStart(offset), direction === 1 ? "min" : "max")
  : child.place(axis, atFrameStart(offset + seatPx), "baseline");
```

**Implementation**: `src/ast/_node.ts`

Pins the whole chart into the container by landing one anchor of the root's bbox
at a target coordinate. The canvas is a frame `[0, final]` on each axis, and the
root's axis order starts at the frame's start edge (the bottom for a continuous y).
_Which_ anchor depends on whether the axis is sized:

- **Given dimension** → pin the **baseline** (local `0`) at the scope's seat from the
  start edge. The canvas box is `[0, given]`, and any content seated outside it (axis
  labels past the start edge, ticks past the end) is reserved as the per-side
  overhangs in the render pass.
- **Shrink-to-fit dimension** (`w`/`h` omitted, so `finalH = size`) → pin the
  content's **start edge** to the frame's start. The canvas box _is_ the content's
  full extent, so the content fills `[0, size]` exactly and the overhang formulas
  (`-min`, `max - finalH`) compute `0` for that axis with no special-casing.

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

Constraint placement works in anchor coordinates, not just node origins. The
`Placeable` protocol in `_node.ts` exposes `localAnchor(axis, anchor)` so the
placement solver can turn `start`/`middle`/`end`/`baseline` relations into
equations over a node's absolute `min`. `GoFishNode.localAnchor()` reads the
node's intrinsic dimensions in its own local frame, which keeps baseline and
asymmetric-box alignment independent from whatever display transform is later
projected for rendering.

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

After layout completes, the render phase turns the laid-out tree into pixels in
**two passes**: **lower** (walk the baked scenegraph, emit a flat display-list IR of
positioned primitives in absolute pixels) and **paint** (a single backend turns that
IR into output — SVG today). There is no per-shape SVG emission in between: each
shape/operator owns a `lower()` method that describes _itself_ as display-list items,
and one backend paints the whole list. The full as-built model is
[Rendering](/internals/core/rendering); this section covers how `render()` drives it.

### Entry Point: The `render()` Function

**Location**: `src/ast/gofish.tsx` (`render()`)

The render function is called from `gofish()` after layout data is available:

```tsx
return render(
  {
    width: data.width,
    height: data.height,
    svgPadding,
    defs,
    rightOverhang: data.rightOverhang,
    topOverhang: data.topOverhang,
    leftOverhang: data.leftOverhang,
    bottomOverhang: data.bottomOverhang,
    hasLegend: data.hasLegend,
  },
  data.child
);
```

`render()` no longer takes `axes`/`axisFields` or the scale/space context — all
the chrome is in the laid-out tree by now, so render only needs the computed
extent and the measured per-side overhangs to size the SVG. It computes the SVG's
size and the `toPixel` coordinate map (below) with `svgFrame`, lowers the baked tree,
and paints each item into an `<svg>`. `toDisplayList` sizes its viewport with the
same `svgFrame`.

### Render Pass 1: Chrome Reservation

**Location**: `src/ast/gofish.tsx` (`svgFrame()`)

`render()` draws **no chart chrome of its own** — no axis lines, tick marks, tick
labels, ordinal category labels, _or titles_, and no legend swatches. All of it
was elaborated into ordinary nodes during layout (see Pass 7: Chrome Elaboration) and renders as part of the
node tree like any other shape. The former bespoke render-time path (hand-written
`<text>` title elements behind fixed `Y_TITLE_MARGIN` / `X_TITLE_MARGIN` gutters)
has been deleted, so `render()` has zero chart-chrome special cases left.

What `render()` _does_ do is size the SVG around the measured extent of that
chrome, on all four sides. `layout()` hands it four gutter measurements:
`leftOverhang`, `bottomOverhang`, and `topOverhang` (negative-space gutters and
top overflow off the outermost wrapper: tick/label rows, the seated y-title and
x-title, and any content a constraint seated above the canvas), and
`rightOverhang` (a legend column, or content displaced past the right edge), plus
`hasLegend`. `svgFrame` reserves exactly enough on each side:

```typescript
const EDGE_GAP = 8; // breathing room between gutter content and the SVG edge
const reserve = (o: number) =>
  o > 0 ? Math.ceil(Math.max(pad, o + EDGE_GAP)) : pad;
const left = reserve(leftOverhang);
const top = reserve(topOverhang);
const bottom = reserve(bottomOverhang);
// the right side: a legend column keeps a full `pad` beyond it
width = hasLegend
  ? left + width + rightOverhang + reserve(0)
  : left + width + reserve(rightOverhang);
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
The right side carries _two_ kinds that must be reserved _differently_: a chart
with a legend column historically reserves its overhang plus `pad`, while displaced content
(like a marginal band) should run through `reserve()` like the other gutters. The
two cannot be unified by magnitude — a single-row legend overhangs by roughly the
same few pixels as a wide rightmost x-tick label, yet the legend must be _added_
to the width while the tick spill must be _absorbed_ into `pad`. Only whether
the root carries a legend can tell them apart, so `layout()` reports `hasLegend`
with the one right overhang, and `svgFrame` adds it plus `pad` beside a legend and
runs it through `reserve()` otherwise. This is the one place a chart-chrome flag still influences
sizing — kept deliberately, because the distinction is semantic, not geometric.

### Render Pass 2: SVG Container Creation

**Location**: `src/ast/gofish.tsx` (`render()`)

```typescript
<svg
  width={frame.width}
  height={frame.height}
  xmlns="http://www.w3.org/2000/svg"
>
```

The SVG container is sized to the content (`width`/`height`, read off the
pre-chrome content node in layout) plus the measured reserves on each side. There is
**no inner flip `<g>`**: layout is already in y-down pixels, so the display-list items
paint directly under the `<svg>`.

### Render Pass 3: The Coordinate Fold (`toPixel`)

**Location**: `src/ast/gofish.tsx` (`render()`)

SVG is **y-down** (top-left origin), and so is layout: a continuous y grows upward
because layout placed it that way (see [Axis direction](#axis-direction)). So the map
on the render session only adds the gutter offset:

```typescript
toPixel: ([gx, gy]) => [gx + left, gy + top], // in svgFrame
```

The lower pass produces items already in **final absolute pixels**: no flip group, no
per-shape transform. `toPixel` is a translate, so straight paths stay straight (a
warped path just maps each control point through it). See
[Rendering](/internals/core/rendering).

### Render Pass 4: Lowering the Baked Tree

**Location**: `src/ast/gofish.tsx` (`render()`), `src/ast/displayList/lower.ts`

```typescript
const paintBaked = () => lowerToDisplayList(child).map(paintSVG);
```

`lowerToDisplayList(child)` bakes the resolved tree into a globally z-ordered list of
`{ node, transform }` entries (see
[Flattening the Scenegraph](/internals/layout/coord-flattening)) and lets each entry
lower itself via `INTERNAL_lower(coordTransform?, transformOverride?)`:

```typescript
export const lowerToDisplayList = (root) =>
  bake(root).flatMap((d) => d.node.INTERNAL_lower(undefined, d.transform));
```

The display list is the **concatenation of every node's `DisplayItem[]` fragment**.
Unlike the old `INTERNAL_render`, `INTERNAL_lower` does not pre-recurse children: a
node reaching it is either a leaf or a **bake boundary** (`coord`, `box`, `connect`,
`arrow`, `enclose`, the compositors) that re-walks its own subtree with its absolute
transform composed in. A node with no `lower()` throws.

**Nodes that draw nothing.** A node can take part in layout without contributing any
pixels: it keeps its dims, its datum and its role as a `selectAll` anchor, and emits
an empty fragment. `GoFishRef` (a placement stand-in) has always lowered this way, and
`blank()` now does too — `Blank` in `src/ast/shapes/rect.tsx` builds a `rect` node,
renames its type to `blank` and calls `INTERNAL_emitNothing()` (`_node.ts`), which
replaces the node's lowering with one that returns `[]`. Because every draw path — the
SVG paint pass, the `toDisplayList` export, and a bake boundary's re-walk of its
subtree — goes through `INTERNAL_lower`, one rule makes the node invisible everywhere,
with no "visible" flag for paint to consult and no option that can turn drawing back
on. For the same reason `blank()` takes no paint-only options (stroke, corner radius):
its `fill` survives only because it seeds the color scale. This matters at scale: the [blank-fusion
rewrite](/internals/frontend/mark-factory) synthesizes one anchor `blank` per row, so a
26,000-row line chart used to emit 26,000 zero-size `<rect>` elements (and 26,000
entries in the interaction hit-test map) that nobody could see or click.

Its sibling is **`INTERNAL_visibleWhile(owner, visible)`**, and the pair is worth reading
together because the difference is which tier decides. `INTERNAL_emitNothing` is
for a node that must never draw, and it answers at resolve. `INTERNAL_visibleWhile`
is for a node whose drawing comes and goes with a signal — a `time.sequence`'s
keyframe groups, where the clock picks which band is showing — and it answers at
paint: the items are lowered either way and their opacity is patched through
the live-slot side table, each rule read once per tick as one decision the items
under it share, so only the items whose rule changed its answer are patched (see
[Reactivity](/internals/frontend/reactivity)). A resolve-time answer there would
make the clock a pipeline dependency and put the whole chart through layout on
every tick, for a change that alters nothing above the marks themselves.
Emitting nothing wins over being visible: a node with no items has nothing to
patch, so the two compose with no coordination.

A visibility rule is set under an owner (a sequence, for its keyframes) and covers
the node's whole subtree. `INTERNAL_lower` paints a node only while every owner's
rule holds, each owner's being the one set nearest the node, so a sequence sets the
rule once on each keyframe group, and marks that a later elaboration pass adds under
the group hide with it. Setting a rule again from the same owner replaces it, so a
second layout does not pile rules up. The label pass is the case that needs this: it wraps a keyframe group
in a new layer that holds the group beside its label `Text`s, after the sequence has
set its rule. `wrapPreservingIdentity` (`src/ast/elaborationUtils.ts`) moves the rule
onto the wrapper along with the group's name and key, so the labels are inside the
rule's subtree, show only with the year they label, and belong to that year's
keyframe (`keyframeOf` in `src/timeWindow.ts` reads the key of the node under the
sequence's Frame).

A `time.history({ last })` inside a keyframe gets a rule of its own from the
sequence, set under the same owner, so for the marks under it it stands in for the
keyframe group's rule: they show while the group's band overlaps `[T − last, T]`
(`lifetimeRule` in `src/timeWindow.ts`). A transition hides the marks it moves,
labels included, with `INTERNAL_emitNothing`: the moving mark is their drawing, and a
trail behind it is a `time.history` of another mark in the same keyframe. Each leaf
it moves also lends the transition its drawing,
`INTERNAL_lendDrawing`: the transition draws a text where the playhead has taken
it, and paints a box as the mark it moves is painted. A node keeps the lowering it was built with, so it lends its real drawing
even after it has been silenced. The lent drawing lowers through the same body as
`INTERNAL_lower`, so its items keep their ids and live channels, but it skips the
visibility rule: the transition decides when the moving copy shows.

A build-in (`src/animation/`) uses a third hook, `INTERNAL_animate(rule)`, which
also answers at paint. The node lowers at rest. The rule then rewrites the items
to the build clock's current state and registers a live slot for each field that
changes: the geometry for a grow or a wipe, the opacity for a fade. The node keeps
its layout box, the room it takes at rest, so nothing above it sees the effect
play, and the chart is laid out once. A mark's labels paint under the same rule
as riders that follow its timing. They find it through `_attachedTo`, which the
label pass sets with `INTERNAL_attach` (the inverse of `_attachments`), so the
order in which a mark and its label lower does not matter. A taken-over drawing
skips the rule, as it skips visibility.

### Render Pass 5: Per-Shape Lowering and Painting

Each shape/operator owns a `lower(ctx) → DisplayItem[]` — the extension point that
replaced `_render`. It receives `{ intrinsicDims, transform, renderData,
coordinateTransform, toPixel }` and returns this node's fragment of the display list:
an axis-aligned rect lowers to a `rect` item; a bar in a non-linear (e.g. polar)
coordinate space lowers to a warped `path` item (its points mapped through both the
coordinate transform and `toPixel`); text lowers to a `text` item; and so on. The
"draw-rect vs draw-path" decision a rect used to make at render time is decided once,
during lowering. Shared helpers live in `src/ast/displayList/lowerHelpers.ts`
(`pathToPixelSVG`, `rectItemFromBox`, `lowerStyle`).

A single backend then paints each item. `paintSVG`
(`src/ast/displayList/paintSVG.tsx`) emits SolidJS JSX for the live path; its
pure-string sibling `displayListToSVG` (in `gofish-ir`) emits markup with no DOM. Both
consume the **same** list and a cross-check test keeps them in lockstep. Because items
are in final absolute pixels, painting is verbatim — a `rect` item becomes
`<rect x y width height …/>`. See [Rendering](/internals/core/rendering) for the IR's
item kinds (`rect`/`ellipse`/`path`/`text`/`image`/`group`/`composite`/`mask`) and the
`toDisplayList({ w, h })` terminal that stops at the IR for non-SVG consumers.

### Render Pass 5.5: Interaction hooks (when reactive)

The [reactive layer](/internals/frontend/reactivity) adds a few hooks to this
phase that are inert on the static path. The render terminal
(`chartBuilder.ts`) always resolves under an **ambient interaction context**, so
a `live()` channel or a library input read inside `derive()` can register during
resolve; if nothing registers, rendering proceeds untouched. When something does,
`INTERNAL_lower` (`_node.ts`) stamps each emitted item's `id` (the node's uid, for
`data-gf-id` hit-testing) and — for a `live()` channel carried on the node as
`__gfLive` — bakes a datum-bound thunk into a per-item side table (`liveSlots.ts`)
that `paintSVG` re-evaluates reactively. `render()` (`gofish.tsx`) then publishes
the lowered frame (items + recorded `posScales`/`toPixel`) to the runtime before
paint and attaches delegated event listeners to the `<svg>`. See
[Rendering](/internals/core/rendering#the-interaction-hooks-in-paint) for the
paint side.

### Render Pass 6: Axis Rendering (removed)

The bespoke axis-rendering pass that used to live here (hand-written SVG for
continuous/ordinal axes, ~400 lines of `gofish.tsx`) was **deleted**. Axes are
now elaborated into ordinary GoFish nodes during layout (see Pass 7: Axis
Elaboration and [Axes](/internals/frontend/axes)), so they render through the
normal node-tree pass above with no special casing. Axis **titles** were the
last artifact still drawn here; they too are now elaborated during layout
(see Render Pass 1), so nothing axis-related is drawn directly at render time.

### Render Pass 7: Legend Rendering (removed)

The bespoke legend-rendering pass that used to live here (a `<For>` over
`scaleContext.unit.color` hand-placing swatches behind a fixed `LEGEND_MARGIN`)
was **deleted**. Color legends are now elaborated into ordinary GoFish nodes
during layout (see Pass 7: Chrome Elaboration, and
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
5. **Chrome Elaboration** (axes when `axes` is enabled): the chart is wrapped in layers
   carrying the y tick marks/labels (constraint-pinned at their data values)
   and the per-category x labels (`ref`-bound to the bars)
6. **Layout Calculation**:
   - X-positions computed by `spread` operator (ordinal spacing)
   - Y-positions set to 0 (bars start at baseline)
   - Heights computed from data values using size scale factors
7. **Ordinal Scale Building**: Maps category keys to x-positions

### Step 3: Render Pass

1. **Lower**: each bar's `lower()` emits a single `rect` display-list item — a
   linear-space, one-dimension-data-driven bar lowers to an axis-aligned rectangle in
   absolute pixels (its pixel box mapped through `toPixel`):

   ```typescript
   // X is aesthetic (positioned by spread), Y is data-driven
   const gxMin = displayDims[0].min ?? 0;
   const width = displayDims[0].size ?? 0; // Inferred by spread
   const height = displayDims[1].size ?? 0; // From data
   // rectItemFromBox maps the box through toPixel → { kind: "rect", x, y, w, h }
   return [
     rectItemFromBox(gxMin, gxMin + width, 0, height, toPixel, { style }),
   ];
   ```

2. **Axes**: already part of the node tree (elaborated during layout), so
   the category labels, the y tick marks, and the axis titles lower alongside the
   bars — nothing axis-related is drawn separately.
3. **Paint**: `paintSVG` turns each `rect` item into `<rect x y width height …/>`;
   the whole list paints directly under the `<svg>` with no flip group.

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

### Measuring the passes

The passes above are instrumented for benchmarking via `src/ast/perf.ts`. Each
labeled phase is bracketed in `runLayout()` / `layout()` (and the paint path in
`render()`) with `perfNow()` / `perfAdd(label, …)`, accumulating per-pass
durations under the labels `resolve` (Passes 2–6: color/name/label/alias/space
resolution = domain inference), `axes` (Pass 7 + title/legend elaboration),
`embed` (the `resolveEmbedding` pass), `solve` (Pass 9 constraint solve),
`lower` (display-list lowering) and `paint` (display-item → SVG), plus `fonts`
(the webfont-readiness await).

Alongside the per-pass **timings** (`current.labels`), the same run records
scene-graph **size counters** (`current.counts`) via `perfSetCount(name, value)`:
`nodes` (the count of nodes in the fully elaborated tree the solver sees,
walked just before `solve`) and `displayItems` (the number of items `lower`
emits). Unlike timings these are absolute sizes, not accumulated. The bench
driver reads the global directly, so the shape `window.__GOFISH_PERF__.current`
= `{ labels, counts }` — with `counts.nodes` and `counts.displayItems` — is the
contract; `perfSnapshot()` returns a `{ labels, counts }` copy of the same.

Collection is **off by default and zero-cost when off**: the helpers short-circuit
on `globalThis.__GOFISH_PERF__?.enabled`, and the node-count walk is additionally
guarded by `perfEnabled()` so the off path never traverses the tree. The published
library build replaces the compile-time constant `__GOFISH_PERF_INSTRUMENTATION__`
with `false` (via `vite.config.ts`'s `define`), so the minifier dead-code-eliminates
the whole subsystem — the npm package ships none of it. The bench harness
(`tests/scripts/bench.ts`) flips the runtime flag on to read per-pass numbers
for the ecological example suites and the synthetic asymptotics sweeps.

For production-codegen numbers (rather than the Vite dev transform + SolidJS dev
mode no user runs), the `build:bench` script (`vite build --mode bench`) emits an
instrumented, minified bundle to `dist-bench/` — identical to the published `dist/`
build but with `__GOFISH_PERF_INSTRUMENTATION__` defined `true` so the subsystem
survives. `dist-bench/` is gitignored and excluded from the published package; the
bench driver aliases `gofish-graphics` to it.

## Key Takeaways

1. **Layout is separate from rendering**: All spatial calculations happen in the layout phase
2. **Underlying space determines scale types**: The underlying space resolution pass is critical for determining how to scale and render
3. **Keys enable axis labeling**: The key resolution pass enables ordinal axes to find and position category labels
4. **Rendering adapts to coordinate spaces**: each shape's `lower()` adapts what display-list item it emits (an axis-aligned `rect` vs a warped `path`) based on which dimensions are data-driven and what coordinate transform is active
5. **Contexts flow through passes**: The three session contexts (scope, scale, key) are populated during layout and used during rendering

## Code References Summary

- **Main entry point**: `src/ast/gofish.tsx`
- **Node implementation**: `src/ast/_node.ts`
- **Rect shape**: `src/ast/shapes/rect.tsx`
- **Bar chart helper**: `src/charts/bar.ts`
- **Underlying space types**: `src/ast/underlyingSpace.ts`
