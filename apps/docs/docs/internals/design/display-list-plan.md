---
title: "Plan: Building the Display List IR"
section: Speculative Notes
order: 36
status: draft
---

# Plan: Building the Display List IR

The companion to [A Core IR and a Display List](/internals/design/core-ir) — that
note argues _what_ the display list is (post-solve, viewport-baked, backend-agnostic
positioned primitives) and _why_ Semiotic wants it. This one is the implementation
roadmap.

**The headline finding: this is not greenfield.** The rendering IR is half-built,
and an active multi-stage refactor (#39 "stage 3") is already converging on it.
`ast/_displayObject.ts` defines `DisplayObject = { node, transform }` and documents
itself verbatim as _"a node in GoFish's rendering IR"_ with a known end-state:
_"fully self-contained primitives with no `node` back-reference (stage 3-D)."_ The
plan is to **finish that end-state** and add the three things it is missing:
self-containment, backend-agnosticism, and serialization.

Tracked by [#75 (rendering IR)](https://github.com/gofish-graphics/gofish-graphics/issues/75),
enabling [#42 (multiple rendering backends)](https://github.com/gofish-graphics/gofish-graphics/issues/42).

## Status

- **Phase 0 (universal bake) — landed.** `bake()` is the single render entry
  (`coordinateTransforms/bake.ts`), boundary-recursive over the self-drawing /
  space-remapping operators, with draw order resolved globally. Verified
  pixel-behavior-preserving (`capture-diff` flags only the benign `<g>`-collapse;
  boundary charts — polar, compositing — are byte-identical).
- **Phase 3 (wire format) — landed.** `packages/gofish-ir/src/display-list/`
  defines the `gofish-display-list` document across the three encodings
  (`schema.ts` / `validate.ts` / `jsonSchema.ts`), with a reference SVG backend
  (`render.ts`, `displayListToSVG`) demonstrating backend-agnosticism, plus tests.
- **Phase 1 body (per-shape `lower()`, coord-at-bake), Phase 2 (Canvas / WebGPU
  backends), the live `toDisplayList` emitter, and [#605] — staged.** The
  `DisplayItem` type is defined; populating it from a baked tree is the next step,
  gated on the coord-transform model below.

## What already exists (the substrate)

- **`ast/_displayObject.ts`** — `DisplayObject = { node, transform }`, the flat
  child-less draw entry; explicitly the rendering IR, with its end-state named.
- **`ast/coordinateTransforms/bake.ts` → `flattenLayout`** — already collapses a
  resolved scenegraph into a flat `DisplayObject[]` with absolute composed
  transforms. **But only inside the `coord` operator** (`coord.tsx:352`); the
  general path still renders via nested `<g transform>` recursion (`gofish.tsx:819`).
- **`_node.ts` → `INTERNAL_render(coordTransform?, transformOverride?) → JSX`** —
  the draw method; calls each mark's `_render(...)` to emit SVG JSX.

The three gaps between this and a display-list IR: (1) draw entries back-reference
the AST and emit JSX directly — no backend split; (2) no serialization boundary;
(3) coordinate-transform handling needs care — see the next section, which is the
crux of the whole plan.

## The coordinate-transform model (corrected)

An early draft of this plan said "coordinate transforms are applied lazily at render
time; hoist them into the bake." That was wrong, and getting it right is the
load-bearing part of the design. The correction came from two findings:

**Coord is a layout-time concern, because it is nested and referenceable.** A
`coord` operator's warped bounding box feeds its _parent's_ layout, and a `ref`
into a coord subtree needs the target's resolved position. Indeed `coord.layout`
(`coord.tsx:147`) already computes warped geometry: at `:199` it calls
`computeTransformedBoundingBox` per child and unions the results into the coord
node's own screen bbox. So the warp is partly a **layout product**, not a pure
render effect.

**But layout resolves only _coord-space_ child positions plus the _parent's_ screen
bbox — not per-child screen positions.** A [spike](#the-spike-cross-boundary-refs)
confirmed children are laid out in coordinate space (`size = [2π, R]`), placed at
baseline `(0,0)` in that space, and the transformed bbox is unioned **only** into
the parent — never written back to the child.

The two facts reconcile the old disagreement by splitting the claim:

| concern                                                                | resolved by                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| a coord's **own** warped bbox (for its parent's layout, for nesting)   | **layout** (`coord.tsx:199`)                                        |
| each **primitive's** screen geometry (the warped path of a petal/rect) | the **bake** (applies the coord transform to coord-space positions) |

So the display-list bake is **not a pure read-off**: it _applies_ each coord scope's
transform to that scope's coord-space positions to produce screen primitives. What
it must _not_ do is recompute the parent-bbox warp layout already did.

**Consequence: the bake is boundary-recursive, not root-global.** A coord remaps
_absolute_ positions within its scope, so you cannot compose a single global
translate chain through it. The bake flattens within each coord scope, emits that
scope's warped primitives, then treats the scope as a unit in its parent's space
(whose own coord may re-warp it). Nested coords nest. This is the
[scoped-resolution-boundaries](/internals/design/constraints-as-core) principle:
the bake pass must be boundary-recursive.

### The spike: cross-boundary refs

Tracing one `ref` into a polar subtree surfaced a hard limit, now filed as
[#605](https://github.com/gofish-graphics/gofish-graphics/issues/605):

> A `ref`/`connect`/`arrow` whose target is inside a `coord` subtree, evaluated from
> **outside** that scope, resolves to the target's **coordinate-space** `(θ, r)` box
> — not its warped screen `(x, y)`. The transform is never written back to children
> (`_ref.tsx:315` reads `selectedNode.intrinsicDims`, which is θ/r), and the lone
> `computeTransformedBoundingBox` caller only feeds the _parent_ bbox.

It has stayed invisible because every shipping polar story (e.g.
`tests/polarCenterRibbon.ts`) keeps the **entire** `ref`/`connect` structure
_inside_ the `coord(...)` wrapper, so refs are coord-space → coord-space and the
whole subtree is warped together at render. Within-scope refs are self-consistent;
the cross-boundary case is never exercised.

**Implication for the IR:** a serializable display list can faithfully carry
`ref`/`connect`/`arrow` targets **only within a coord scope** until #605 is
addressed. "Children's bboxes are referenceable later" holds intra-scope, not
cross-scope. Resolving #605 (warped screen positions exposed to out-of-scope
consumers) is therefore a **Phase 1 prerequisite or an explicit non-goal** — not an
afterthought.

## The phases

### Phase 0 — Universal, boundary-recursive bake (behavior-preserving refactor)

**Goal:** make the per-coord `flattenLayout` the _single_ bake for the whole tree,
recursing on coord-scope boundaries, so render consumes one flat `DisplayObject[]`
everywhere — not just under `coord`.

- Generalize `flattenLayout` (`bake.ts`) to run from the root, **boundary-recursive**
  across coord scopes (per the model above). Replace the nested-`<g>` recursion in
  `gofish.tsx:819` and `INTERNAL_render`'s child recursion with a flat map over the
  baked list.
- **Gate:** pixel-equality vs `main` across all stories (`pnpm capture-diff main`),
  _not_ normalized-DOM — flattening reshuffles `<g>` nesting benignly.
- **Ships:** nothing user-visible. The refactor-first step that localizes Phase 1.
  Coordinate with #39 stage-3 (this joins that effort; does not run parallel to it).

### Phase 1 — Self-contained primitives (the heart; closes the #75 core)

**Goal:** invert `_render(ctx) → JSX` into `lower(ctx) → DisplayItem`, where the bake
applies each coord scope's transform and resolves geometry to absolute pixels.

- New `DisplayItem` type — the end-state of `DisplayObject`:
  `{ kind: "rect"|"ellipse"|"path"|"text"|"image", absolute geometry, style (colors
resolved through scales), datum, role }`. Drop the `node` back-reference.
- Per shape (`shapes/rect.tsx`, `ellipse.tsx`, `petal.tsx`, `text.tsx`, image): move
  coord-transform application + path generation (`path.ts`; adaptive sampling already
  landed in #121) out of `_render` and into `lower()`. A petal/warped rect becomes a
  resolved `path`; an axis-aligned rect stays a `rect`. **De-duplicate** the
  layout/render double-warp — the bake produces screen geometry once.
- **Per #75 explicitly:** delete the rect "draw-rect vs draw-path" special-casing —
  decide once at lowering, no dual path (_delete, don't gate_).
- **`role`:** marks → `"node"`; labels/axes/legends/decoration → `"overlay"`. Thread
  the source row onto `DisplayItem.datum` from `renderData`.
- **Prerequisite decision — #605:** either resolve cross-boundary refs to warped
  screen positions during the boundary-recursive bake, or make cross-coord refs an
  explicit build-time error. Settle this before lowering `connect`/`arrow`.
- **Descoped, not solved:** text/image under nonlinear coords. #75 flags that SVG
  cannot arbitrarily warp text/images; Phase 1 emits position-only (transform the
  anchor, don't warp the glyph) and records the limitation.
- **Gate:** pixel-equality. Large diff, visually identity.

### Phase 2 — Backend emitters (closes #42)

**Goal:** `_render` is gone; rendering = `displayList.map(paint)`.

- Extract `paintSVG(DisplayItem) → JSX` (the only remaining SVG knowledge). Both the
  live SolidJS path **and** SVG export (`toSVG`/`save`) consume it.
- Add `paintCanvas(DisplayItem, ctx2d)` (#42); WebGPU optional/later. Additive — no
  pixel-gate on new backends, just visual review.
- **Ships:** Canvas backend; an extensible render API; and **#577 headless SVG falls
  out for free** (display list → SVG string, no DOM).

### Phase 3 — Serialization (the cross-runtime wire format)

**Goal:** the portable `gofish-display-list` document.

- New `packages/gofish-ir/src/display-list/` mirroring `frontend/`, honoring the
  **three-encoding rule** (`schema.ts` + `validate.ts` + `jsonSchema.ts`, then
  `pnpm --filter docs sync-ir-schema`).
- `toDisplayListJSON(node, { w, h }) → DisplayListDocument` / `fromDisplayListJSON`.
  Parameterized by viewport (`gofish(spec, { w, h }, data) → display list`) because
  layout is size-dependent ([Size Claims](/internals/design/size-claims)) — a
  **per-frame artifact, not cached**.
- Validate via the existing IR harness.
- **Ships:** the boundary a non-JS / GoFish-less host (Semiotic, Python) consumes.

### Phase 4 — Downstream consumers (mostly outside this repo)

- **Semiotic adapter:** replace `gofishInterpreter.ts`'s reimplemented solver with a
  thin `DisplayItem → scene-node/overlay` map (`role` decides which) plus a **re-emit
  callback** on resize / data-change (layout is size-dependent — re-run the spec,
  don't re-flow). Pixel-equal, coverage-gap gone. Lands in the semiotic repo.
- Docs: promote the `coord-flattening` essay; flip the display-list section of
  [core-ir](/internals/design/core-ir) from speculative → linked-to-implementation;
  set `_displayObject.ts`'s wiki essay.

## Sequencing value

- **Phases 0–2** deliver #75 and #42 entirely internally — no serialization, no
  foreign consumer. Worth doing on their own.
- **Phases 3–4** add the cross-runtime / Semiotic interop on top.

## Risks / open decisions

1. **The coord-transform model (above) is the load-bearing part.** The bake applies
   per-scope transforms to coord-space positions and must be boundary-recursive; the
   parent-bbox warp stays in layout. Get this wrong and nested/polar charts break.
2. **#605 (cross-boundary refs)** — resolve-to-screen vs explicit-non-goal must be
   decided before Phase 1 lowers `connect`/`arrow`. It is also a standalone latent
   bug (a cross-coord `connect` mis-renders today).
3. **`role` source of truth** — GoFish does not currently tag marks-vs-chrome; needs
   a clean rule (mark factory vs label/axis/legend origin).
4. **Convergence with #39 stage-3** — Phases 0–1 overlap the in-flight
   ledger/transform-retirement work; join it rather than fork it.
5. **Text/image under warps** — descoped to position-only; revisit if a real example
   needs warped glyphs.

## Related

- [A Core IR and a Display List](/internals/design/core-ir) — what the display list is.
- [Flattening the Scenegraph](/internals/layout/coord-flattening) — `flattenLayout` /
  the coord bake this plan generalizes.
- [Size Claims](/internals/design/size-claims) — why the display list is per-frame.
- [#75](https://github.com/gofish-graphics/gofish-graphics/issues/75) (rendering IR),
  [#42](https://github.com/gofish-graphics/gofish-graphics/issues/42) (backends),
  [#605](https://github.com/gofish-graphics/gofish-graphics/issues/605) (cross-boundary refs).
