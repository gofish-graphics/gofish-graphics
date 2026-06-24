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
> `lower`, and the y-flip lives in a single coordinate map (`toPixel`, below) rather
> than in nested SVG `<g>` transforms. The case for the IR is
> [A Core IR and a Display List](/internals/design/core-ir).

## The coordinate fold: `toPixel`

Layout produces a tree of boxes; the lower pass maps each box's coordinates to final
SVG pixels through a single affine map, `toPixel`, set once per emit on the render
session (`RenderSession.toPixel` in `_node.ts`). Two conventions share this one map:

- **Free space is y-DOWN** (SVG-native, top-left origin). A vertical list written
  `[A, B]` reads top→bottom, an explicit `y:` grows downward — what you'd expect from
  SVG, Bluefish, or Typst. This is the **default**:

  ```ts
  const toPixel: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
  ```

- **A `chart()` (or any `coord` scope) is y-UP** (larger _y_ is higher, the
  mathematical convention bars and y-axes want). The root mirrors _y_ about the canvas
  height — reproducing the legacy global flip:

  ```ts
  const toPixel: ToPixel = ([gx, gy]) => [
    gx + leftReserve,
    height + topReserve - gy,
  ];
  ```

Which map is used is decided once at the root: `render()` computes
`effYUp = options.yUp || subtreeHasChart(child)`, where `subtreeHasChart` walks the
tree for any `_isChart` node (set by the chart builder) or any `coord` node (a
coordinate system is inherently y-up). A low-level construction that is genuinely a
value-axis chart (e.g. a box-and-whisker built from primitives) opts in with
`node.render({ yUp: true })`; `axes: true` alone is NOT a y-up signal, because
hierarchical diagrams (icicle, mosaic) use category axes yet read top-down. The chart builder also threads `yUp` through its
render options. This auto-detection means a chart stays y-up even when **composed**
inside a free-space `gofish([...])`/`.layer()` whose render entry never saw the option
(see issues #143 / #16). `leftReserve` / `topReserve` are the measured gutter reserves
for chrome seated past the canvas (see [the passes](/internals/layout/passes)).

> **Historical note.** Before #143, the world was y-up _everywhere_ (one global
> `scale(1,-1)` at the root, plus a per-shape `scale(1,-1)` to un-mirror content). The
> y-down default relocated that flip behind the `yUp` switch above. Shape lowering is
> now **flip-agnostic** — `rectItemFromBox`/image map both box corners through `toPixel`
> and take the component-wise min/abs; text & label rotation read the flip out of
> `toPixel` via `toPixelFlipsY` — so the same shape code is correct under either map. A
> follow-up will express y-up as a true `cartesian` coordinate transform (making it
> composable per-subtree instead of root-global).

Because `toPixel` already carries the orientation and the viewport offset, the display
list is in **final absolute pixels** — the SVG backend emits each item verbatim, with
**no outer flip `<g>` and no per-shape transform**.

`toPixel` is affine (a translate, optionally a y-flip), so a straight path stays straight: a
shape with a curved path just maps each of its control points through `toPixel` and
re-serializes (`pathToPixelSVG` in `lowerHelpers.ts`), with no resampling.

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
children, node)`, which returns that node's `DisplayItem[]` fragment;
- appends any label items (`lowerLabelItems`), since a labeled mark contributes both
  its own primitive and its label text.

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
re-walk its subtree with that transform composed in (via `flattenLayout`) so its
descendants land in absolute coordinates _before_ `toPixel`. Pre-recursed,
parent-relative child items would be mispositioned. This is the same
boundary-recursive structure the bake itself has: each boundary flattens within its
own scope, emits its warped primitives, and is treated as a unit by its parent.

A `coord` operator is the archetype: it lowers its whole subtree into resolved
`path`/`rect`/`ellipse` items whose coordinates are already warped through its
coordinate transform (a petal becomes a `path`, a polar bar becomes a warped `path`),
so the backend never sees the polar mapping — just absolute pixel paths.

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
  backend reconstructs the `feImage`/`feComposite`/`feBlend` filter graph; a
  Canvas/WebGPU backend would map the operator to its own blend state.
- **`mask`** — clip `content` by the alpha of `mask`.

Each item also carries optional **provenance** — `datum` (the source row(s) the
primitive was elaborated from, the hit-testing / accessibility target) and `role`
(`"node"` for a data-bearing mark, `"overlay"` for chrome such as a label, axis, or
glyph detail). What is _gone_ versus the frontend IR or the live tree: no operators,
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
filter graphs and assigning their deterministic def ids.

## How the live `render()` wires it together

The orchestrator `render()` in `gofish.tsx` is now small. It computes the gutter
reserves, picks the y-up or y-down `toPixel` (per `effYUp`, above), stores it on the
render session, and paints the lowered list into an `<svg>`:

```ts
const effYUp = yUp || subtreeHasChart(child); // chart()/coord ⇒ y-up; else y-down
const toPixel: ToPixel = effYUp
  ? ([gx, gy]) => [gx + leftReserve, height + topReserve - gy]
  : ([gx, gy]) => [gx + leftReserve, gy + topReserve];
child.getRenderSession().toPixel = toPixel;
const paintBaked = () => lowerToDisplayList(child).map(paintSVG);
return (
  <svg width={…} height={…} xmlns="http://www.w3.org/2000/svg">
    <Show when={defs}><defs>{defs}</defs></Show>
    {paintBaked()}
  </svg>
);
```

The SVG-export terminals (`toSVG`/`toSVGElement`/`save`) run the same lower→paint
pipeline against a throwaway container and serialize the result.

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
