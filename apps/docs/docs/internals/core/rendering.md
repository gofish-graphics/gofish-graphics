---
title: Rendering
section: Layout & Rendering
order: 70
group: Rendering
status: stable
covers:
  - packages/gofish-graphics/src/ast/gofish.tsx
  - packages/gofish-graphics/src/ast/displayList/lower.ts
  - packages/gofish-graphics/src/ast/displayList/paintSVG.tsx
  - packages/gofish-graphics/src/ast/displayList/toDisplayList.ts
  - packages/gofish-graphics/src/ast/displayList/lowerHelpers.ts
  - packages/gofish-ir/src/display-list/schema.ts
  - packages/gofish-ir/src/display-list/render.ts
  - packages/gofish-ir/src/display-list/composite.ts
---

# Rendering

Once [layout](/internals/layout/passes) has solved every node's box, the chart still
has to become pixels. GoFish does this in **two passes**:

1. **Lower** — walk the laid-out, baked scenegraph and emit a flat **display list**:
   an ordered array of positioned primitives (rects, ellipses, paths, text, …) in
   final, absolute, y-down pixels. This is the _render IR_ (intermediate
   representation) — geometry and resolved style, with every transform already
   folded in.
2. **Paint** — hand the display list to a single backend that turns each primitive
   into output. Today there are two backends, both consuming the _same_ list:
   `paintSVG` (live SolidJS JSX) and `displayListToSVG` (a pure markup string, in
   the `gofish-ir` package).

There is no per-shape SVG emission anywhere in between. A shape does not know what a
`<rect>` element looks like; it knows only how to describe _itself_ as a display-list
item. That separation — every primitive lowers to a backend-agnostic IR, one backend
paints — is the whole architecture of this pass.

> **History.** GoFish used to render in a single pass: each node had a `render()`
> method that emitted SVG JSX directly (`INTERNAL_render` walked the tree, the root
> wrapped everything in a `<g transform="scale(1,-1) …">` to flip the y-axis), and
> there was no IR. That path has been **deleted**. `render`/`INTERNAL_render`/
> `_render`/`_renderLabel` are gone; the extension point each shape implements is now
> `lower`, and there is no y-flip at all: layout is already in y-down pixels (see
> `toPixel`, below). The case for the IR is
> [A Core IR and a Display List](/internals/design/core-ir).

## The coordinate fold: `toPixel`

Layout produces a tree of boxes in **final y-down pixels**: SVG-native, top-left
origin. There is no mirror anywhere between layout and paint. The lower pass maps
each box's coordinates to canvas pixels through `toPixel`, installed on the render
session (`RenderSession.toPixel` in `_node.ts`) before the baked entries lower. It
only adds the gutter offset:

```ts
const toPixel: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
```

So a continuous y axis growing upward is not something paint does. Layout places it
that way. Every node's y axis has a **direction**, `axisDirection(node, 1)` in
`ast/axisDirection.ts`: `+1` when its order runs with the pixels (an ordinal y, so the
first item is at the top) and `-1` when it runs against them (a continuous y, which
grows upward from its origin). A node with no y axis takes its parent's direction,
and the canvas is `+1`. x is always `+1`. The direction is
read off the node's own resolved underlying space and is local: an ordinal spread
inside a bar chart reads top-down inside. Operators reason in their node's axis order
and the one reflection `pixel = direction · order` is applied where geometry crosses
a node boundary (see [Layout & Render Passes](/internals/layout/passes#axis-direction)).
A `coord` declares its own handedness: its transform is math-handed, so its interior
has direction `-1`, and the coord (a pixel box, `+1`) reflects y where the interior
meets the canvas (see
[Flattening the Scenegraph](/internals/layout/coord-flattening)).

**Root placement.** The canvas is a frame `[0, final]` on each axis, and the root's
axis order starts at the frame's start edge: the top for a y that reads top-down, the
bottom for a continuous y. A given dimension seats the root's baseline in that frame
(a free root's baseline at the scope's `originPx`, `descent·σ` from the start edge,
#773; a pinned root at 0, its map carrying `originPx`); a shrink-to-fit dimension
pins the root's start edge to the frame's start, which already includes any descent,
so adding it would count it twice (#574). See
[Underlying Space](/internals/core/underlying-space).

**Chrome is ordinary content.** Axes, axis titles, the legend column and the
colorbar are elaborated as ordinary y-down shapes, in rings around the node that
owns them (the root, for titles and the legend). Their seating constraints run in
the ring's axis order like any other constraint, and the sides are chosen with the
same `axisDirection` (a title follows its axis line; the legend tops out with the
content: the `end` of a y that grows upward, the `start` of one that reads top-down).
Nothing inside them is mirrored, so legend rows read top to bottom with no `reverse`
and the y title is simply rotated `-90°`.

> **Caveat (count-as-magnitude).** A unit visualization that encodes a quantity as a
> _count of ordinal units_ (a unit column chart: `spread`-ing one dot per row) has no
> continuous y, so its spread reads top-down. Such stories are authored for that
> directly (a `reverse` spread, bottom-aligned stacks). The planned fix models a unit
> count as a `stack` with an `inset`, at which point the direction rule grows it upward
> for free.

> **Historical note.** Before #143 the world was y-up everywhere (a global
> `scale(1,-1)`). #143 made free space y-down behind a root switch, and #629 made the
> mirror per subtree: each draw entry carried a `FlipScope` band it was mirrored
> about at paint, with chrome compensations around it. #681 replaced all of that with
> the axis direction above, resolved at layout.

`toPixel` is a translate, so a straight path stays straight: a shape with a curved
path maps each of its control points through `toPixel` and re-serializes
(`pathToPixelSVG` in `lowerHelpers.ts`), with no resampling.

## The lower pass

The driver is `lowerToDisplayList(root)` (`displayList/lower.ts`):

```ts
export const lowerToDisplayList = (root) =>
  bake(root).flatMap((d) => d.node.INTERNAL_lower(undefined, d.transform));
```

`bake(root)` ([Flattening the Scenegraph](/internals/layout/coord-flattening))
flattens the resolved tree into a globally z-ordered list of `{ node, transform }`
entries, each carrying its absolute composed transform. Each entry then lowers itself
via `INTERNAL_lower`, which:

- looks up the node's `_lower` method (its per-primitive lowering — the extension
  point), and the session `toPixel`;
- calls `_lower({ intrinsicDims, transform, renderData, coordinateTransform, toPixel },
children, node)`, which returns that node's `DisplayItem[]` fragment.

`.label(...)` contributes nothing special here. It used to lower a raw `TextItem`
alongside the labeled mark's own fragment (`lowerLabelItems`); a label is now
**elaborated** into a real `Text` node + constraints before layout even runs
(`src/ast/labels/elaborate.tsx`, the same technique `elaborateChrome` uses for tick
labels), so by the time `bake`/`INTERNAL_lower` see the tree, a label is just an
ordinary sibling shape with its own `_lower` fragment.

The display list is the **concatenation of every node's fragment**. A node with no
`_lower` throws — the migration is complete, so every shipping shape/operator supplies
one.

A shape's `_lower` switches on the per-axis **`embedded`** flag to decide
point (0 embedded axes — drawn at pixel size at the transformed center) /
line (1 — the embedded axis sweeps through the transform into an arc) /
area (2 — both axes sweep into a wedge). That flag is authored before layout by
the `resolveEmbedding` pass (wired into the pipeline in `gofish.tsx`; see
[Layout & Render Passes](/internals/layout/passes) and
[Underlying Space](/internals/core/underlying-space)): a value-sized dim embeds
only when its measure matches the axis it sits in, so a foreign-measure size (a
scatter bubble's area) stays a flat point even under a coord.

### Boundaries re-walk their own subtree

`INTERNAL_lower` does **not** pre-recurse children the way the old `INTERNAL_render`
did. A node that reaches `INTERNAL_lower` is either a **leaf** (a bare shape) or a
**bake boundary** — `coord`, `box`, `connect`, `arrow`, `enclose`, and the
Porter-Duff compositors/mask. A boundary carries its own absolute transform and must
re-walk its subtree so its descendants land in absolute coordinates _before_
`toPixel`. Pre-recursed, parent-relative child items would be mispositioned. This is
the same boundary-recursive structure the bake itself has: each boundary flattens
within its own scope, emits its warped primitives, and is treated as a unit by its
parent.

How the re-walk lands descendants in absolute coordinates splits by boundary kind
(#39 stage 6d):

- A **pure translate-only container** (`box`/`frame`, `offset`, `enclose`) flattens
  its subtree with `bakeChildren` (`bake.ts`) — the same z-ordered flatten the root
  bake uses, seeded at the container's own absolute translate — and lowers each
  returned entry at its baked absolute transform (`INTERNAL_lower(coord, d.transform)`).
  There is no per-container `toPixel` closure: the translate is baked into each
  descendant's coordinates, not composed onto the session map. A non-identity `scale`
  is the one part a flat list can't fold, so it stays a `group` wrapper around the
  flattened items.
- A **space remapper** (`coord`) genuinely warps its content, so it keeps a
  `contentToPixel` map: it flattens its subtree (`flattenLayout`) and maps each
  descendant through its coordinate transform then its own translate. A `coord` is the
  archetype: it lowers its whole subtree into resolved `path`/`rect`/`ellipse` items
  whose coordinates are already warped (a petal becomes a `path`, a polar bar a warped
  `path`), so the backend never sees the polar mapping — just absolute pixel paths.
- A **self-drawer** (`connect`, `arrow`) reads its own baked absolute translate
  (`displayTranslate`) to place the geometry it draws from its children's anchors.

Whatever its kind, a boundary that paints its children in turn (`coord`, `box`,
`enclose`, `offset`, `arrow`) takes their order from `orderChildrenForPaint`, the same
rule the bake uses, so a z constraint that parts inside a boundary takes effect there.
A compositor paints one result from a source and a destination child, so it has no
order to take: it calls `assertNoPaintOrder`, which throws if a z constraint parts at
it (see [How a layer orders its children](/internals/layout/coord-flattening#how-a-layer-orders-its-children)).

## The display list IR

The IR type lives in `gofish-ir` (`packages/gofish-ir/src/display-list/schema.ts`) so
it can travel across the Python↔JS boundary and be consumed without a GoFish runtime.
A `DisplayListDocument` is:

```ts
{
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w, h },   // the size this list was solved at
  items: DisplayItem[],
}
```

The item kinds are `rect`, `ellipse`, `path`, `text`, `image`, `group`, `composite`,
and `mask`. The first five are leaf primitives in absolute pixels with resolved
`style` (fill/stroke/opacity/…, already mapped through the color scales). The last
three carry structure the flat-absolute fold cannot express on its own:

- **`group`** — an affine transform group, for the rare `box`/`frame` `scale` a flat
  list can't fold away.
- **`composite`** — a Porter-Duff composite of two sub-lists, named with Figma-style
  operators (`over`/`atop`/`in`/`out`/`xor` plus a CSS `mixBlendMode`). The SVG
  backends reconstruct it as plain SVG masks and `mix-blend-mode`, not an
  `<feImage>` filter graph: `<feImage>` referencing live SVG content has three
  independent browser pathologies (Chrome's GPU raster path clips it at
  fractional page zoom, issue #795; WebKit misaligns its content bbox; WebKit
  can rasterize before a data-URI `<image>` inside it decodes and never
  invalidate), so both painters emit the source and destination groups once
  each and wire them together per-operator: the source is grayscaled with a
  local `saturate(0)` filter, and each layer is alpha-masked by the other
  layer's content (or its inverse) depending on the operator — `over` masks
  neither, `atop`/`in` mask the destination by the source's alpha, `out`/`xor`
  mask the destination by the source's _inverse_ alpha, and `in`/`xor`
  additionally mask the source by the destination's alpha or inverse alpha.
  Only `over`/`atop`/`in` add a `mix-blend-mode` to the destination layer. A
  Canvas/WebGPU backend would map the operator to its own blend state instead.
- **`mask`** — clip `content` by the alpha of `mask`.

Each item also carries optional **provenance** — `datum` (the source row(s) the
primitive was elaborated from, the hit-testing / accessibility target) and `role`
(`"node"` for a data-bearing mark, `"overlay"` for chrome such as a label, axis, or
glyph detail). `role` is a **projection of `datum`-presence**: a `lower` body
derives it via `roleFor(node.datum)` (`lowerHelpers.ts`) — `"node"` exactly when the
item carries a datum, `"overlay"` otherwise — so the two fields can never disagree
and a host can split data from chrome on `role` alone. (Generated chrome carries no
datum, so axes/legends/value-labels classify as `"overlay"` automatically; before
this projection they were hard-coded `"node"` and mis-classified as data.) What is
_gone_ versus the frontend IR or the live tree: no operators,
no constraints, no underlying-space tags, no channels — the solve consumed all of
them. What survives is geometry + resolved style + provenance.

A display list is **viewport-baked**: layout is size-dependent, so the list is valid
only at its `{ w, h }`. A resize requires re-running the spec and re-emitting — it is
a per-frame artifact, not a cached document.

## The paint pass

A backend is a function from one `DisplayItem` to one unit of output. The two that
ship today are structurally identical — a `switch` on `item.kind` — and a cross-check
test keeps them in lockstep, since they must agree pixel-for-pixel:

- **`paintSVG`** (`displayList/paintSVG.tsx`) emits **SolidJS JSX**. This is the live
  path: it keeps SolidJS reactivity and can interleave a user's `defs: JSX.Element[]`.
- **`displayListToSVG`** (`gofish-ir/src/display-list/render.ts`) emits a **pure SVG
  string** with no DOM and no GoFish-runtime dependency. It is usable headlessly and
  is the worked example of how a foreign host (or a future Canvas/WebGPU backend)
  consumes the format — a Canvas backend would walk the same `items` issuing
  `fillRect`/`arc`/`Path2D` calls instead of emitting tags.

Because items are already in final absolute pixels, painting is verbatim: a `rect`
item becomes `<rect x y width height …/>`, an `ellipse` becomes `<ellipse cx cy …/>`,
and so on. The only painter-side cleverness is reconstructing the `composite`/`mask`
mask-and-blend-mode graphs and assigning their deterministic def ids.

## How the live `render()` wires it together

The orchestrator `render()` in `gofish.tsx` is now small. It computes the gutter
reserves from the measured overhangs (`layout()` reads them straight off the root's
pixel box: a negative min is top overhang, a max past the canvas is bottom
overhang), builds `toPixel`, and paints the lowered list into an `<svg>`:

```ts
const toPixel: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
const paintBaked = () => lowerToDisplayList(child, toPixel).map(paintSVG);
return (
  <svg width={…} height={…} xmlns="http://www.w3.org/2000/svg">
    <Show when={defs}><defs>{defs}</defs></Show>
    {paintBaked()}
  </svg>
);
```

The SVG-export terminals (`toSVG`/`toSVGElement`/`save`) run the same lower→paint
pipeline against a throwaway container and serialize the result.

The real `paintBaked` brackets each half with the perf instrumentation
(`src/ast/perf.ts`): it times `lowerToDisplayList(child, toPixel)`
under the `lower` label, records the emitted `items.length` as the `displayItems`
count, then times `items.map((item) => paintSVG(item, interactive))` under `paint`.
Like the layout-pass hooks, this is zero-cost when instrumentation is off and
dead-code-eliminated from the published build — see
[Measuring the passes](/internals/layout/passes#measuring-the-passes).

### The interaction hooks in paint

The [reactive layer](/internals/frontend/reactivity) threads an optional
`InteractionRuntime` through `render()`. When it is present (a chart read a
signal during resolve), three things change; when it is absent — the common case
— paint is **byte-identical** to a non-interactive build.

- **`data-gf-id`.** `paintSVG` takes an optional `PaintContext` whose _only_ job
  is to emit each item's `id` as a `data-gf-id` attribute for pointer hit-testing.
  It is stamped only when a runtime is active, so the static path never emits it.
- **Live slots.** A `live()` channel bakes a datum-bound thunk into a
  `WeakMap` side table keyed by the display item (`liveSlots.ts`) at lower time —
  outside the item, so the display list stays pure serializable data. In paint,
  `paintSVG` looks the item up and, if a slot exists, _calls the thunk in JSX
  attribute position_ (`fill={live.fill()}`), so Solid tracks the signal reads and
  patches only that attribute — no re-lower, no re-layout. A `"text"` slot
  overrides text content while the box keeps its measured size, and a slot named
  after one of the item's own geometry fields (`x`, `y`, `w`, `h`, `cx`, `cy`,
  `rx`, `ry`, `d`) overrides that field, which is how a mark moves without being
  laid out again — see [Reactivity](/internals/frontend/reactivity). What the
  item carries statically is what serialization and hit-testing see.
- **Frame publication.** Before painting, `render()` publishes the lowered
  `items`, the root `posScales` (data → layout pixels, read off the placed root
  in its axis direction), and `toPixel` to the runtime as an
  `InteractionFrame`, so hit-testing and data↔px conversions see the current
  frame. `gofish()` stashes the chart's state on the container
  (`__gofishState`: the current Solid root's dispose and the runtime). There
  is one state object per chart, not per paint. A re-render of the same chart
  (the interaction scheduler re-renders into the same container on every spec
  change, with the same runtime) disposes the previous reactive root and swaps
  the new one into that same object. When a different chart takes the
  container over, the old chart is torn down entirely: its root and its
  runtime, which detaches its listeners and drops it from every input it read.
- **The `View` handle.** `gofish()` returns a `View` for the chart it mounted:
  `{ container, unmount() }`. Every public `render` returns one, synchronously
  for a node and as a `Promise<View>` wherever a resolve comes first (a chart
  builder, a mark or combinator surface, a component thunk). `unmount()` runs
  the full teardown, `disposeChart(container)`, but only while the container's
  state is still the object the view was made with. That identity check is
  what makes `unmount()` idempotent (the first call clears the state) and
  keeps an old view from tearing down a newer chart in the same container,
  while staying valid across the chart's own re-renders. A re-render that was
  still resolving when its chart was unmounted checks `runtime.isDisposed()`
  and does not mount. `disposeChart` stays internal. Besides `unmount`, its
  one caller is the story harness, which renders stories that hand back only
  their DOM, so before each story it walks the page and disposes every chart
  it finds, then removes what the previous story left. It finds charts by
  their `__gofishState` rather than through a registry in the engine, because
  in the prod bench the stories run the `dist-bench` bundle while the harness
  imports engine source, and the two share no module state. An input the
  chart read, such as a looping `timer()`, is not owned by the chart, but it
  only ticks while something reads it (see the timer section of
  [Reactivity](/internals/frontend/reactivity)), so a timer whose last reader
  was the unmounted chart stops.

The mechanism is: `data-gf-id` is the hit-test hook; the side table + JSX
attribute calls are the paint reactivity; the runtime carries neither — it owns
scheduling, event dispatch, and hit-testing only.

## Laying out more than once: `labelAngle: "auto"`

Every render path reaches layout through `runLayout`, which normally runs the
pipeline once (`layoutOnce`). The one exception is an axis with
`labelAngle: "auto"`: `runLayout` then hands off to
`layoutWithAutoLabelAngles` (`axes/autoLabelAngle.ts`), which builds and lays out
the chart once per candidate angle, scores the finished label geometry per label
row, and returns the winning `LayoutData` (laying out once more when the rows
chose different angles). `LayoutData.legendFields` (the fields a rendered
legend shows) lets it warn when a hidden category row is left unnamed. Paint
then proceeds from that data
exactly as above. Because layout writes each node's box once, each run needs a
fresh tree, which comes from the root's `rebuild` (set by the surface that built
it). See [Axes](/internals/frontend/axes#automatic-label-angle-labelangle-auto).

## `toDisplayList`: stopping at the IR

Outside consumers that are not SVG — a Canvas/WebGPU backend, or a foreign host such
as Semiotic — want the IR, not markup. `toDisplayList(node, { w, h })`
(`displayList/toDisplayList.ts`) is the terminal that stops at the display list: it
runs the full layout + bake at the given viewport, computes the viewport and
`toPixel` exactly as `render()` does, and returns the `DisplayListDocument` without
painting. It is exposed on the chart builder and on any node as
`.toDisplayList({ w, h })` — the post-layout, positioned-output analogue of
[`toJSON`](/internals/frontend/serialization-api), which serializes the _pre-layout_
spec. See the [export API](/js/api/core/export) for the user-facing surface.

## Where this is going

Two backends (SVG live + SVG string) exist; the IR is the default and _only_ render
path. The remaining work is additive — a Canvas backend and a WebGPU backend
(`displayList.map(paintCanvas)`), and the Semiotic adapter that maps `DisplayItem →`
scene-node/overlay by `role`. None of those touch the lower pass; they are new
painters over the same list.
