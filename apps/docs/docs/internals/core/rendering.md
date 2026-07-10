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
SVG pixels through an affine map, `toPixel`, installed on the render session
(`RenderSession.toPixel` in `_node.ts`) just before each baked draw entry lowers.
y-orientation is a **per-scope** property (issue #629), so the map differs by scope
rather than being one global root decision.

- **Free space is y-DOWN** (SVG-native, top-left origin). A vertical list written
  `[A, B]` reads top→bottom, an explicit `y:` grows downward — what you'd expect from
  SVG, Bluefish, or Typst. This is the **ambient** base map:

  ```ts
  const baseDown: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
  ```

- **A continuous-_y_ scope is y-UP** (larger _y_ is higher, the convention bars and
  y-axes want). It mirrors _y_ about its OWN placed band `[baseY, baseY+height]`:

  ```ts
  const toPixel: ToPixel = ([gx, gy]) =>
    baseDown([gx, 2 * baseY + height - gy]);
  ```

Which band a draw entry mirrors about is decided by the **bake walk** (`bake.ts`), not
one root switch. Each entry is tagged with the `FlipScope` it draws in
(`DisplayObject.flip`); the lower driver builds that entry's `toPixel` from it. A node
opens a scope when its own resolved y space `isCONTINUOUS` (`declaredYUp`) — a value
axis, a datum-positioned mark, a swarm's distribution; an **ORDINAL / UNDEFINED** node
declares nothing and inherits the ambient. The mirror therefore lands at each **topmost
continuous-y node**, so a vertical bar chart flips (continuous value axis) while a
horizontal bar chart does not (ordinal category axis), and a box-and-whisker built from
primitives flips with no opt-in. `options.yUp` still forces a **global** y-up ambient.

The rule is decided by the **underlying-space tree** — the σ-scope that establishes a
continuous y position scale — never by wrapper geometry. Three things fall out of that:

- **Root vs. nested band.** The **root plot content** mirrors about the authoritative
  canvas frame `[0, finalH]`, carried on `contentNode._rootFlipScope` (stamped by
  `layout()` once `finalH = contentNode.dims.size` is known — the exact frame the old
  global flip used). The canvas origin `0` is _not_ recoverable from the node's placed
  bbox (a shrink-to-fit pin can offset it), so it is stamped rather than re-derived. A
  scope that opens **below** the canvas frame — a facet cell, a mixed-dashboard subtree
  — carries no stamp and mirrors about its own allocated band (`scopeBox`).
- **A mixed free-space composition needs no special case.** A bar chart beside a
  heatmap composes under a `spread` whose y unions to ORDINAL/UNDEFINED (the ordinal
  category axis wins the union), so nothing opens a scope at the top; the walk descends
  and each continuous subtree opens its own scope while the ordinal neighbor keeps the
  ambient y-down map. This is exactly the all-or-nothing bug the old single global flip
  could not close — and it closes with no "blocking" logic, because the union already
  reports the neighbor as ordinal.
- **Chrome is the coord rule applied to annotation: the plot's frame places its BOX,
  but never re-interprets its INTERIOR.** A titled/legended chart's outer wrapper
  _unions_ the plot's continuous y, so it too `declaredYUp` — but the axis-title /
  legend / colorbar shapes are chrome that reads top→bottom regardless of which way the
  value axis grows. The chrome-elaboration passes stamp those subtrees `_ambientYDown`;
  their seating constraints stay authored in the shared abstract frame (same side as
  the axis labels, exactly as before #629), and the bake **box-mirrors** each chrome
  subtree about the plot's flip scope — so the title lands on the same _visual_ edge as
  the flipped tick labels — while everything _inside_ the chrome renders ambient:
  glyphs upright, legend rows top→bottom with no `reverse`, colorbar max at the top.
  Only the plot's data marks (and their in-plot point labels — UNDEFINED-y but _inside_
  the scope) actually flip. The title/legend _wrapper_ layers are marked
  `_scopeTransparent`: they do not open the scope themselves (their bbox includes the
  chrome, the wrong mirror band); they descend to the plot content they wrap, which
  opens it about the canvas frame. The chrome's placement frame is stamped directly on
  each outermost `_ambientYDown` chrome subtree by `layout()` (as `_chromeFrame`, the
  plot content's flip scope), so the bake reads it off the node rather than searching up
  through the wrappers on every visit. A plot that doesn't mirror has no frame, and its
  chrome passes through untouched (a heatmap keeps its top-side axis title).

- **`coord`** (polar/clock) opens a scope about its own box when none is active
  (a standalone pie reads y-up) and INHERITS the parent scope when nested (a flower's
  petals or a pie glyph keep their placement in the parent frame) — its own transform
  fixes the interior angular sense either way, so a polar interior is identical in free
  space and inside a y-up scatter. A parent's orientation places the coord's _box_; it
  never re-interprets its interior.

Nesting is idempotent by construction — **the first scope on a root-to-leaf path wins,
and every descendant inherits it**. A node opens a scope only in the ambient y-down
frame (`incomingFlip === undefined`); once a scope is active, a nested continuous node
(or a nested `coord`) simply inherits the active band instead of opening a second one.
Ordinal/undefined nodes declare nothing either way. So a continuous scope inside a
continuous scope sees the flip already active and inherits it — no double flip, no
cancellation. (This is an inherit rule, **not** an XOR: an XOR would re-mirror or cancel
on nesting, which the code never does — see `opensScope` in `bake.ts`, gated on
`incomingFlip === undefined`.)

> **Caveat (count-as-magnitude).** A unit visualization that encodes a quantity as a
> _count of ordinal units_ (a unit column chart: `spread`-ing one dot per row) has no
> continuous y, so the rule leaves it y-down. Such stories are authored for y-down
> directly — bottom-aligning their stacks (`alignment: "end"`) so the units grow
> upward — rather than forced y-up. The principled end-state is to model a unit-count
> stack as a baseline magnitude (continuous), at which point the rule flips it for free.

> **Historical note.** Before #143, the world was y-up _everywhere_ (one global
> `scale(1,-1)` at the root, plus a per-shape `scale(1,-1)` to un-mirror content). The
> y-down default (#143) relocated that flip behind a single root `effYUp` switch;
> #629 then localized it into the per-scope `FlipScope` mechanism above, so a mixed
> composition flips only its continuous scopes. Shape lowering is **flip-agnostic** —
> `rectItemFromBox`/image map both box corners through `toPixel` and take the
> component-wise min/abs; text & label rotation read the declared flip off the session
> (`declaredFlipsY`, cross-checked against the `toPixelFlipsY` probe under
> `GOFISH_FLIP_CHECK`) — so the same shape code is correct under either map.

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
filter graphs and assigning their deterministic def ids.

## How the live `render()` wires it together

The orchestrator `render()` in `gofish.tsx` is now small. It computes the gutter
reserves, builds the y-DOWN base map plus a per-scope mirror factory (`toPixelFor`),
and paints the lowered list into an `<svg>`. Orientation is decided **per draw entry**
by the bake walk (each entry carries its `FlipScope`), so `render()` does not pick a
single global map; it only threads the base map and the `ambientFlip` that
`options.yUp` (`LayoutData.yUp`) forces. The canvas frame the root scope mirrors about
is not passed here — it is stamped on `contentNode._rootFlipScope` back in `layout()`,
where the final canvas height is known:

```ts
const baseDown: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
const toPixelFor = (flip?: FlipScope): ToPixel =>
  flip === undefined
    ? baseDown
    : ([gx, gy]) => baseDown([gx, 2 * flip.baseY + flip.height - gy]);
const ambientFlip = yUp ? { baseY: 0, height } : undefined;
const paintBaked = () =>
  lowerToDisplayList(child, toPixelFor, ambientFlip).map(paintSVG);
return (
  <svg width={…} height={…} xmlns="http://www.w3.org/2000/svg">
    <Show when={defs}><defs>{defs}</defs></Show>
    {paintBaked()}
  </svg>
);
```

The lower driver (`lowerToDisplayList`) installs each baked entry's scope
(`session.flip = d.flip` and `session.toPixel = toPixelFor(d.flip)`, via the shared
`installFlip` helper) just before lowering it — so a continuous-y subtree mirrors
within its own band while an ordinal-y neighbor stays y-down, all sharing one flat
display list. The declared orientation is derived from `session.flip !== undefined`
(`declaredFlipsY`), not a separate stored bit.

The SVG-export terminals (`toSVG`/`toSVGElement`/`save`) run the same lower→paint
pipeline against a throwaway container and serialize the result.

The real `paintBaked` brackets each half with the perf instrumentation
(`src/ast/perf.ts`): it times `lowerToDisplayList(child, toPixelFor, ambientFlip)`
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
  overrides text content while the box keeps its measured size.
- **Frame publication.** Before painting, `render()` publishes the lowered
  `items`, the root `posScales`, and `toPixel` to the runtime as an
  `InteractionFrame`, so hit-testing and data↔px conversions see the current
  frame. Re-rendering into the same container first calls a stashed
  `__gofishDispose` to tear down the previous reactive root (the interaction
  scheduler re-renders into the same container on every spec change).

The mechanism is: `data-gf-id` is the hit-test hook; the side table + JSX
attribute calls are the paint reactivity; the runtime carries neither — it owns
scheduling, event dispatch, and hit-testing only.

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
