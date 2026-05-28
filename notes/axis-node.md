# Node-Based Axis Rendering

Axes are GoFishNodes created during layout, not SVG overlays in gofish.tsx.

## Pipeline

```
resolveColorScale → resolveNames → resolveKeys → resolveLabels
→ resolveUnderlyingSpace
→ resolveAxes        top-down walk; marks axis_x/axis_y on claiming nodes
→ resolveNiceDomains applies d3.nice() to all POSITION domains in-place
→ layout             axis budgeting + axis child creation
→ place
→ INTERNAL_render    axis children injected alongside content children
```

## Key Design Decisions

### resolveAxes

Top-down. First unclaimed node with POSITION/DIFFERENCE/ORDINAL space claims that dim and sets `axis_x/y = true`. Manual `axis: false/true` on any operator overrides inference **and** claims the dim (false blocks children too).

Only POSITION, DIFFERENCE, ORDINAL spaces get axes. SIZE does not. Coord-transform nodes (polar, clock, etc.) are skipped entirely — they manage their own coordinate space.

**Layer nodes:** do not claim axes themselves. They accumulate which dims children have claimed and pass `budgetOnly` dims to subsequent siblings. A sibling that receives a `budgetOnly` dim reserves the same `AXIS_WIDTH` margin (keeping content areas aligned for correct overlay) but does not create axis SVG. The `tickPad` compression is also applied to budget-only nodes so posScales are identical across all siblings.

**Polar axis overrides:** `spread`/`stack` operators tag themselves with `_axisDir` (the stackDir). Inside `coord` nodes, `collectOverrides` uses `_axisDir` to map per-operator `axis:` flags to polar dimensions (theta vs radial) independently.

### resolveNiceDomains

Nices **all** POSITION domains in the tree, not just axis-bearing nodes. This is required because layer nodes pass through resolveAxes without claiming, so their domain would otherwise be un-niced when gofish.tsx reads it to compute posScales. Coord-transform nodes are skipped entirely (their domains are fixed mathematical constants like `[0, 2π]`).

### layout() — axis budgeting

```
axisBudgetX = axis_y || _axisBudgetOnlyY ? AXIS_WIDTH : 0   (left space)
axisBudgetY = axis_x || _axisBudgetOnlyX ? AXIS_WIDTH : 0   (bottom space)
contentSize = [max(0, size[0] - axisBudgetX), max(0, size[1] - axisBudgetY)]
```

Content size is clamped to zero so charts with `h:0` (e.g. 1D strip plots) don't get negative content heights and NaN posScales.

**Nested / faceted axes — inner baseline expansion:**

- `innerBaselineY` (for `_layoutAlignDir === 1`, horizontal spreads): `axisBudgetY += AXIS_WIDTH` when any child has `axis_x`; reserves extra bottom row for inner x-axis labels.
- `innerBaselineX` (for `_layoutAlignDir === 0`, vertical spreads): `axisBudgetX += AXIS_WIDTH` when any child has `axis_y`; reserves extra left column for inner y-axis labels.
- **Internal baseline alignment:** After `alignChildren`, each inner frame is shifted back by `-_contentBaseline[alignDir]` so bars land at `posScale(0)`. `_contentBaseline` propagates upward through transparent layer nodes.
- **Coord node children:** after `resolveAxes` runs on children of a `coord` node, all Cartesian `axis_x/y` and `_axisBudgetOnly*` flags are cleared from the entire coord subtree. This prevents per-operator `axis:` overrides (e.g. `stack({ axis: true })`) from applying Cartesian axis budgets inside polar coordinate space, where sizes are in radians/radius units. The `_axisOverride` values are still read by `collectOverrides` for polar axis routing before clearing.

**posScale rescaling:**

- `rootNiceSpace` is stored on the render session by gofish.tsx after `resolveNiceDomains()` runs. Axis nodes use it for tick generation so per-species scatters inside a layer show the full union domain rather than their own narrow slice.
- `axisSpaceX/Y` for axis node creation uses `rootNiceSpace[dim]` only when both root and local space are POSITION — preventing an outer ORDINAL (e.g. facet key) from being used for an inner POSITION (e.g. scatter x="year").
- `outerManagesX/Y = posScales[dim] !== undefined`: when a posScale is already provided by an ancestor pass it through unchanged to avoid double-compression in faceted charts.
- Tick-edge labels that bleed slightly past the content boundary are accommodated by the SVG padding (default `40px`). A proper axis layout pass will handle this more precisely in the future.

Other:

- Children's transforms are shifted by `[axisBudgetX, axisBudgetY]` after `_layout`
- `intrinsicDims` is expanded to include axis budget
- Axis child nodes are created and placed: y-axis at `[0, axisBudgetY]`, x-axis at `[axisBudgetX, 0]`

### INTERNAL_render

Axis children are included in the `allChildrenJSX` array passed to `_render`, rendering inside the same `<g>` at their placed positions.

## axis.tsx — Axis Node Types

`AXIS_WIDTH = 30` — budget allocated per axis
`AXIS_LINE = AXIS_WIDTH / 2` — where the axis line is drawn (centered in budget)
`TICK_LEN = 4` — ticks extend from line away from content
`LABEL_GAP = 3` — gap between tick end and label anchor

Three constructors via `createAxisNode({ dim, space, contentSize, posScale, ownerNode, keyContext })`:

- **ContinuousAxisNode** — POSITION space; line + ticks + numeric labels
- **DifferenceAxisNode** — DIFFERENCE space; line + ticks + interval labels between ticks
- **OrdinalAxisNode** — ORDINAL space; labels only. Key positions are pre-computed at layout time (in `createAxisNode`) by walking each key node up to the axis-owning node via `posRelToAncestor`, stored in `renderData.keyPositions`. The render function reads positions directly — no tree walk at render time.

## Polar Axes (coord.tsx)

Polar charts (clock, polar, bipolar) use a separate axis path — the `coord` node renders its own axis SVG inside its `render()` callback rather than creating `_axisChildren` nodes.

- `resolveAxes` skips coord nodes entirely (no Cartesian axis creation inside coordinate-transform space) and collects per-operator `axis:` overrides using `_axisDir` tags.
- `resolveNiceDomains` also skips coord nodes to preserve fixed mathematical domains.
- Polar axes are gated by the `axes` ChartOption flowing through `Frame → coord`. When enabled, the coord's render function uses `spaceRef` (captured during `resolveUnderlyingSpace`) to determine which polar axes to draw:
  - **Ordinal theta axis** (when X space is POSITION, e.g. pie/donut): outer ring + evenly-spaced continuous count ticks using niced domain.
  - **Ordinal theta labels** (when X space is ORDINAL, e.g. rose): category labels around the circumference.
  - **Radial axis** (when Y space is POSITION): line at theta=0 with tick marks, labels on the left.
- Per-operator `axis: false/true` on the inner spread/stack propagates to polar axes via `_polarAxisX/Y` flags set during `collectOverrides`.

## scatter.tsx — self-computed posScales

When the outer x-space is ORDINAL (no posScale provided), `GoFishNode.layout()` injects a local POSITION posScale with `TICK_EDGE_PAD` into `contentPosScales` before `_layout` is called, ensuring scatter circles and the axis node share the same consistent padded scale.

## User API

```typescript
// Per-operator override (blocks/enables entire subtree)
spread({ by: "species", dir: "x", axis: false });
spread({ by: "lake", dir: "x", axis: { x: true, y: false } });

// Polar axis control flows through ChartOptions to coord
Chart(data, { coord: clock(), axes: true, padding: 80 });

// Per-render padding for overflow labels/annotations
chart.render(container, { w: 400, h: 300, axes: true, padding: 30 });
```
