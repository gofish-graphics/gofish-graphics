# Label & Annotation System — Research & Design Notes

> **Status:** research / design-space doc, not a plan to execute. Surveys the references, maps GoFish's current state, and lays out the design axes with alternatives on each. Several axes are unsettled by intent — for iteration on syntax and approach.
>
> Companion to the brainstorm in [`label-syntax.md`](./label-syntax.md).

---

## 1. Goals

A label/annotation system that:

1. Adds **semi-automatic point label placement** (the immediate ask).
2. Foundational for **point / line / area / ribbon** labels — same primitives, swapped strategies.
3. **Generic in the placeable** — text, image, callout, custom shape — not text-only.
4. **Composes with existing operators** (`connect`, `arrow`, `enclose`, `position`); doesn't introduce a parallel annotation runtime.
5. **Path-aware collisions** — point labels in connected scatterplots avoid the lines, not just the points (vega-label parity).

Two soft preferences set during this round:

- **One operator** (probably `label()`), polymorphic over strategy. Not two parallel `label`/`annotate` operators (was confusing).
- No back-compat shims — replace the existing `.label()` cleanly.

---

## 2. References

### 2.1 Current GoFish state

- v3 modifier: `.label(accessor, opts)` — `packages/gofish-graphics/src/ast/_node.ts:470-473`. Sets `_label?: LabelSpec` on the node (`_node.ts:140`).
- Rendered post-layout via `_renderLabel()` (`_node.ts:403-407`) → `renderLabelJSX()` (`labels/renderLabel.tsx:68-124`); appended as JSX sibling.
- Position inference is purely declarative: `labels/labelPlacement.ts:122-184` (`inferLabelPosition`), `:186-266` (`calculateLabelOffset`), `:269-293` (`getLabelTextAnchor`), `:295-334` (`shouldShowLabel`). Positions are an enum: `"center"`, `"outset"`, `"inset-top-end"`, etc.
- **No collision avoidance** — `shouldShowLabel` only _hides_ labels that don't fit.
- Label propagation parent → child if parent has no datum (`_node.ts:475-490`).
- Coordinate transforms (`coordinateTransforms/coord.tsx:20-25`) bypassed by labels (rendered in screen space at the leaf's translate).
- AST node lifecycle (`_node.ts:116-185`): construct → `resolveUnderlyingSpace` → `layout(size, scaleFactors, posScales)` → `render`. After layout: `intrinsicDims` and `transform` populated; `.dims` getter (`_node.ts:320-346`) gives final bbox per axis.
- Three current passes: domain inference, layout, placement+render.
- Operators that already read post-layout child bounds (the model for any new placement operator): `graphicalOperators/connect.tsx`, `arrow.tsx` (uses `perfect-arrows`'s `getBoxToBoxArrow`), `enclose.tsx`, `position.tsx`.
- v3 marks via `createOperator` factory (`marks/createOperator.ts:325-349`); `by` for splits; `channels: {prop: "size"|"pos"|"color"}`.
- `select(name)` / `.name()` for cross-layer references via `scopeContext.ts`.
- Bounds utilities present but unused: `util/bbox.ts`, `util/interval.ts`.

### 2.2 vega-label

Source: `vega/packages/vega-label/src/`. (IEEE paper `arnumber=11298828` was unreachable — findings are from code + JSDoc.)

- **Architecture:** single greedy first-fit pass. Sort labels by priority; rasterize-as-you-go onto an occupancy bitmap; first non-collision candidate wins.
- **Bitmap:** packed `Uint32Array` (`util/Bitmap.js`); coord scaler coarsens to ~1M cells (`util/scaler.js`); two-layer (interior + outline) so "inside" labels collide vs the outline and "outside" labels collide vs interior + already-placed labels (`util/markBitmaps.js`).
- **Mark labels:** 8-compass × user offsets; first non-collision wins (`util/placeMarkLabel.js`). Anchor codes are 8-bit; `dx/dy ∈ {−1, 0, 1}`; placed via `boundary[1+dx]`/`boundary[4+dy]` selecting min/mid/max from a 6-tuple.
- **Area labels** — three algorithms (`util/placeAreaLabel/`):
  - `naive`: pick the area sample with the widest slice; no collision check.
  - `reduced-search`: sweep candidates around the slice midpoint outward, then **binary-search font size** (lo=textHeight, hi=viewportHeight) at each candidate.
  - `floodfill`: 4-direction interior expansion through unvisited pixels; same binary-search-on-font.
- **Limitations:** AABB only; text-only (no public hook for arbitrary shapes); no rotated text; no leader lines; greedy with no backtracking; lines get _one_ label at start or end (no along-the-path placement, no curvature awareness); **no ribbon support**; lossy bitmap above ~1M-cell viewports; tightly coupled to `vega-canvas`/`vega-scenegraph` for rasterization.

### 2.3 AnnoGram

Sources: arXiv:2507.04236 ("AnnoGram: An Annotative Grammar of Graphics Extension"); repo `rahatzamancse/vega-lite-annotation` (`packages/vega-lite-annotation-library/src/lib/`).

- **Conceptual model:** annotations as first-class siblings of scales/geoms. The implementation collapses everything to one root type:
  ```ts
  RootAnnotation = { target: Markers, text?, enclosure?, connector? /* indicator declared but inactive */ }
  ```
  A `RootAnnotation` is a **bundle** — one shared target, up to four effect slots. Connectors auto-route between sibling effects in the bundle.
- **Targeting (`Markers`):** `data-expr` (predicate over datum), `data-index` / `indices`, `data-space` / `pixel-space`. Resolution walks the rendered vega scenegraph (`enclosureAnnotation.ts`, `extract-sceneGraph.ts`). Other target kinds declared but commented out: `AnnotationMarker`, `ChartPartMarker`, `AxisMarker`.
- **Effects:**
  - `TextAnnotation` — full vega text styling.
  - `EnclosureAnnotation` — schema declares Rect/Ellipse/CurlyBraces/ShapePath, **only Rect ships**.
  - `ConnectorAnnotation` — 9 curve interpolations + arrowheads at either end; auto-routes if `connect_from/to` omitted.
- **Position resolver:** bitmap is implemented (`positionResolver.ts`) but **not consumed** by the placement pipeline; `auto` falls back to defaults. Paper §6 admits this.
- **Architecture:** external wrapper around vega-lite compiler, not a fork. `vlAnnotation.ts` orchestrates: normalize → strip → compile → re-add as vega marks.
- **Headline claim:** annotations as grammar primitives bound to data (`data-expr`/`data-index` resolved against scenegraph), portable across chart types (Figure 4 demo: same annotation array applied to bar/line/scatter).
- **Limitations:** one annotation per effect-slot per bundle; no facet/concat composition; no interactive annotations; placement is incomplete; many declared types unimplemented.

### 2.4 d3-area-label (Curran Kelleher)

- **Algorithm:** bisection method searching for the **largest rectangle** (matching the label's measured aspect ratio) that fits inside an area defined by `(x, y0, y1)` strips. For each candidate size, tests x-coordinates as left edges, checking that vertical clearance `(ceiling − floor)` exceeds the label height across the label's width span.
- **API:** `areaLabel.area(d3Area)` accepts a d3.area generator instance; outputs an SVG transform string.
- **Distinction from bitmap floodfill:** **resolution-independent** and **vector-exact**. No raster, no canvas. Cheaper than vega-label's reduced-search/floodfill for the common stacked-area / streamgraph case.
- **Constraint:** assumes areas are defined by horizontal strips with single-valued ceiling/floor functions. Doesn't handle arbitrary polygons (treemap leaves with holes, choropleth regions). Vega-label's bitmap is more general but heavier.

---

## 3. Design space

### 3.1 The anchor / generator / acceptor split

Three independent questions a placer answers:

- **Anchor — where on the target should the label go _near_?** Not a point; a _support set_. A bbox; a polyline; a polygon; a centerline.
- **Generator — what candidate positions to try, in what order?** For a bbox: 8 compass positions with offset, in priority order. For a path: samples along the curve preferring endpoints / longest-straight / midpoint. For an area: largest inscribed rectangle, or interior search.
- **Acceptor — can the label go there?** Does the candidate rect overlap any other mark? Any already-placed label? For inside-the-target labels, does it stay inside?

Each axis varies independently. Same primitives compose for all label kinds; the obstacle list grows as we walk the post-layout tree.

| Strategy                     | Anchor         | Generator                              | Acceptor                                       |
| ---------------------------- | -------------- | -------------------------------------- | ---------------------------------------------- |
| `"box"` (today's behavior)   | bbox           | priority-list compass                  | self only                                      |
| `"point"` (vega-label-style) | bbox           | compass-N                              | tree-wide AABB list (incl. path-segment AABBs) |
| `"line"`                     | polyline       | sample-along + endpoint                | tree-wide AABB list                            |
| `"area"`                     | polygon strips | largest inscribed rect (d3-area-label) | polygon-interior + tree-wide AABB              |
| `"ribbon"`                   | centerline     | walk-along + tangent-orient            | tree-wide AABB                                 |

**Key consequence:** path-avoidance for point labels (vega-label parity for connected scatterplots) falls out of the _acceptor_ seeing path-typed marks during its tree walk and emitting per-segment AABBs. It's not a separate feature — it's inherent in "the acceptor sees everything."

### 3.2 Operator surface — settled, but syntax open

Soft consensus: one polymorphic `label()`, with strategy controlled by a `type` opt that **defaults from the target's mark kind**.

What's still open: the exact spelling, slot composition, default ergonomics. A few sketches to chew on.

**Sketch A — minimal, type defaults from target kind, place defaults to text**

```ts
bar.label("value"); // type: "box", place: text("value")
scatter.label("name", { type: "point" }); // override strategy
line.label("series"); // type: "line" inferred
area.label("cat"); // type: "area" inferred

bar
  .label({ place: img("/star.svg", { w: 16, h: 16 }) }) // generic placeable

  .add(
    label({
      // standalone for cross-mark
      target: select("scatter").at({ name: "Norway" }),
      place: text("highest GDP/cap"),
      connect: arrow({ bow: 0.3 }),
      enclose: enclose({ padding: 6 }),
    })
  );
```

**Sketch B — explicit type-named operators, `label` as polymorphic shorthand**

```ts
bar.boxLabel("value");
scatter.pointLabel("name");
line.lineLabel("series");
area.areaLabel("cat");
ribbon.ribbonLabel("flow");

bar.label("value"); // polymorphic shorthand, dispatches by mark kind
```

Better discoverability per strategy; loses the unified-mental-model property.

**Sketch C — strategy as a separate factory passed in**

```ts
bar.label("value", { strategy: pointStrategy({ priority: ["top", "right"] }) });
area.label("cat", { strategy: areaStrategy() });
```

Most extensible (users can define new strategies); least ergonomic.

**Open syntax questions:**

- Is `place` a top-level key or wrapped (`{ place: text(...) }` vs `{ text: "..." }`)?
- Where does the AnnoGram-style bundle live? (a) keys on the standalone `label({ connect, enclose })`; (b) separate top-level operators that take a `label()` as one arg; (c) chain on the per-mark form (`bar.label("v").enclose({ padding: 6 })`).
- Should priority anchors be `positions: ["outset-top", "outset-right"]`, `position: ["outset-top", ...]` (same key, polymorphic), or a generator opt (`generator: compassN({ priority: ["top", "right"] })`)?
- Should `.label()` accept a node directly when the placeable isn't text? `bar.label(img(...))` vs `bar.label({ place: img(...) })`.

### 3.3 Generic-in-placeable

Settled approach: the placer never inspects the placeable. It lays it out in isolation with `(size=[Inf,Inf], scaleFactors=[1,1])` against a throwaway parent, reads `placeable.dims` (`_node.ts:320-346`) for size, then commits a transform. Established pattern — `connect`/`arrow` already do this (`connect.tsx:62-65`, `arrow.tsx:69-72`). Means `text(...)`, `img(...)`, `vstack(text, text)`, or any custom GoFish node work with no special-casing.

Open: whether the placeable is allowed to depend on the target (e.g., size proportional to target). Probably yes via accessor pattern: `place: (target) => text(target.datum.value)`.

### 3.4 Selection / targeting

Reuse `select(name)` and `.name()`. Extend `LayerSelector` (`marks/chartBuilder.ts:42`) with predicates — the v3 analogue of AnnoGram's `data-expr` / `data-index`:

```ts
select("bars").where((d) => d.value > 100);
select("bars").at({ category: "A" });
select("bars").indices([0, 3, 7]);
```

Open: should there be a semantic shorthand (`select("bars").max("value")`, `select("bars").top(3, "value")`)?

### 3.5 Bundle composition (AnnoGram parallel)

AnnoGram's bundle is one target + up to four effect slots sharing an anchor, with auto-routed connectors between sibling effects.

In gofish: do we need a "bundle" concept at all, when we have `connect`, `arrow`, `enclose` as standalone operators?

**Option A — slot keys on the `label()` call:**

```ts
.add(label({
  target:  select("pts").at({ name: "Norway" }),
  place:   text("highest GDP/cap"),
  connect: arrow(...),
  enclose: enclose(...),
}))
```

Pro: AnnoGram-clean; auto-wiring. Con: a subset of `label`'s opts are wiring, not placement.

**Option B — wire it yourself with refs:**

```ts
const callout = label({
  target: select("pts").at({ name: "Norway" }),
  place: text("highest GDP/cap"),
}).name("callout");

.add(callout)
.add(arrow({ from: select("pts").at({ name: "Norway" }), to: select("callout") }))
.add(enclose(select("callout"), { padding: 6 }))
```

Pro: small primitives, fully composable, no special slots. Con: verbose; manual wiring; user has to name the label.

**Option C — operator that takes a label as one arg:**

```ts
.add(callout(
  label({ target: ..., place: text("...") }),
  { arrow: arrow(...), enclose: enclose(...) }
))
```

Pro: explicit composite operator. Con: a new name for what's basically B.

Open question worth iterating on. AnnoGram's slot model is ergonomic but hides the wiring; gofish has tended toward small composable primitives.

### 3.6 Pipeline integration

A new pass is needed because the acceptor must see _every_ placed mark before placing _any_ label (today's `shouldShowLabel` only sees one shape). Layout is bottom-up; placement needs global occupancy.

**Option A — fourth pass** between `layout` and `INTERNAL_render`:

```
resolveColorScale → resolveNames → resolveKeys → resolveLabels
  → resolveUnderlyingSpace → layout → placeLabels → INTERNAL_render
```

Recommended, but introduces a new traversal stage and a new context (the acceptor).

**Option B — fold into the existing render pass** as a top-down sweep that defers label rendering until obstacles are gathered. Smaller architectural change but tangles render with placement.

**Option C — annotations as marks** that participate in normal layout, with collision handled by a special parent operator (a "collision-aware layer"). Most gofish-y but requires placeable nodes to know they're labels.

**Coordinate transforms.** Anchors should project through ambient `coordinateTransform`; the placer + placeable run in screen space. `bboxAnchor` reads `node.dims` (correct for cartesian); a future `polarBboxAnchor` reads through the parent `coord` without changing the placer.

### 3.7 Acceptor implementation

**Option A — AABB list with interval index.** Walk post-layout tree once; emit one bbox per shape, a chain of segment AABBs per path. Sufficient for points (incl. path avoidance), lines, ribbons. Not sufficient for "fit text inside an arbitrary polygon." Cheap, ships fast. Recommended for v1.

**Option B — port vega-label's packed-Uint32 bitmap.** ~1M cells, 32-bit packed, two-layer (interior + outline). Required for arbitrary-polygon interior search. Heavier: needs per-mark rasterizer registry to handle coord-transformed shapes (gofish doesn't have vega's scenegraph rasterization — would need either a hidden-SVG measurement pass or duplicate the `coord.flattenLayout` logic).

**Option C — d3-area-label-style analytic search for area interiors.** No bitmap. Works for areas defined by `(x, y0, y1)` strips. Doesn't help with arbitrary polygons but covers the common chart cases. Combine with Option A for the rest.

For Phase-1 point labels, A is enough. The interesting choice is whether area-interior labels (later) go via B (general but heavy) or C (lighter, narrower applicability) or both.

### 3.8 Re-layout feedback

Today's bounds are frozen post-layout. A label that doesn't fit is hidden — there's no "re-layout to make room" loop.

- **Stay frozen** (recommended start): hide-on-overflow, document the limit.
- **One-shot iteration:** a label marked `critical` that fails to place triggers a re-layout with extra padding, capped at one iteration to keep layout monotonic.
- **Constraint solver:** general fixed-point; expensive; probably never.

---

## 4. Algorithm catalog (per label kind)

### 4.1 Point labels

- **vega-label compass-8 + bitmap** — first-fit over priority anchors with offset; bitmap occupancy.
- **vega-label compass-8 + AABB list** — same algorithm, AABB list instead of bitmap. (vega-label doesn't ship this; would be a gofish variant.)
- **Force-directed** (D3 v4 era `d3-labeler`, simulated annealing) — label nodes repel each other and overlapping marks; iterative. More expensive, sometimes nicer-looking.
- **ILP / global optimum** — academic, rarely used in interactive charts.

### 4.2 Line labels

- **Endpoint** (vega-label) — at start or end of the polyline.
- **Sample-along-path with priority** — sample at intervals; prefer longest-straight / least-collision / midpoint of longest visible run.
- **Curvature-aware along-path** — orient the label tangent to the curve; SVG `textPath`. Looks great for sparklines and small multiples.

### 4.3 Area labels

- **vega-label naive** — widest-slice midpoint, no collision check.
- **vega-label reduced-search** — sweep candidates around slice midpoint, binary-search font size at each.
- **vega-label floodfill** — flood-fill interior pixels, binary-search font size.
- **d3-area-label** — analytic largest inscribed rectangle of the label's aspect ratio, on `(x, y0, y1)` strips. Resolution-independent.
- **Polylabel** (Mapbox) — finds pole-of-inaccessibility (point inside polygon farthest from any edge) for arbitrary polygons. Doesn't directly choose a font size but gives a great starting point.

### 4.4 Ribbon labels

- **Centerline walk** — sample along centerline; orient text to local tangent; bound vertical extent by local ribbon width.
- **Sankey-style midpoint** — single label at the centerline midpoint, oriented horizontally if local slope is shallow.
- **Endpoint with leader** — at the wider end of the ribbon, with optional leader line into the narrow part.

---

## 5. Open questions

Worth iterating on before committing:

1. **Operator name and shape.** `label()` polymorphic, or strategy-named operators (`pointLabel`, `areaLabel`, …) with `label()` as shorthand? Where do AnnoGram-bundle slots live (slot keys, manual wiring, separate combinator)?
2. **Default placeable.** Does `bar.label("value")` short-circuit to `text(...)`, or is everything expressed as `bar.label({ place: text("value") })` for consistency? The first is ergonomic; the second is uniform.
3. **`positions: [...]` priority list.** Is this a `label()` opt, or a generator opt (`generator: compassN({ priority: [...] })`)? More general at the cost of more typing.
4. **Targeting predicates.** What's the API for "the maximum-value bar" — `select("bars").max("value")` semantic shorthand, or always `select("bars").where(d => d.value === max(data.value))` and let the user write the reduce?
5. **Pipeline pass shape.** New 4th pass with its own context (cleanest), or fold into render (smaller diff)?
6. **Coord-transform projection.** Anchors project through `coordinateTransform` (recommended), or placer projects, or screen-space-only labels with explicit projection helpers?
7. **Area algorithm.** d3-area-label as default + bitmap floodfill as fallback for arbitrary polygons, or pick one and live with it?
8. **Re-layout feedback.** Hide-on-overflow forever, or one-shot critical-label iteration in Phase 4+?
9. **Cross-pollination with `text()` mark.** Does the standalone `text` mark (`shapes/text.tsx`) participate in label placement when used as a top-level mark, or is "label" a strict superset (text mark = always at given position; label = collision-aware text placement)?
10. **What about ordinal-axis labels and legend labels?** They're "text near a thing" too. Do they share the placer infrastructure (uniform but possibly over-engineered) or stay separate (current state)?

---

## 6. Files referenced (gofish)

Current label code (would be touched/refactored):

- `packages/gofish-graphics/src/ast/_node.ts:116-185, 320-346, 385-407, 470-490`
- `packages/gofish-graphics/src/ast/labels/labelPlacement.ts`
- `packages/gofish-graphics/src/ast/labels/renderLabel.tsx`
- `packages/gofish-graphics/src/ast/gofish.tsx:178-181, 263-265`
- `packages/gofish-graphics/src/ast/marks/chartBuilder.ts:42`
- `packages/gofish-graphics/src/ast/marks/createOperator.ts:325-349`

Reusable infrastructure:

- `packages/gofish-graphics/src/ast/graphicalOperators/connect.tsx`
- `packages/gofish-graphics/src/ast/graphicalOperators/arrow.tsx`
- `packages/gofish-graphics/src/ast/graphicalOperators/enclose.tsx`
- `packages/gofish-graphics/src/ast/graphicalOperators/position.tsx`
- `packages/gofish-graphics/src/ast/shapes/text.tsx:117-333`
- `packages/gofish-graphics/src/ast/coordinateTransforms/coord.tsx`
- `packages/gofish-graphics/src/util/bbox.ts`, `util/interval.ts`
- `packages/gofish-graphics/src/ast/scopeContext.ts`

External:

- vega-label: https://github.com/vega/vega/tree/main/packages/vega-label
- AnnoGram repo: https://github.com/rahatzamancse/vega-lite-annotation
- AnnoGram paper: arXiv:2507.04236
- d3-area-label: https://github.com/curran/d3-area-label
- Vega-Lite legible-label paper: IEEE arnumber=11298828 (paywalled; couldn't fetch)
