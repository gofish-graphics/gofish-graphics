# layer

Stack another tier over the current one. `.layer(child)` takes a `chart(...)`
pipeline, a bare relational mark (`line()`, `ribbon()`), or a bare leaf mark
(`text()`, `rect()`, …) as its argument. `.layer(...)` returns a `LayerBuilder`,
so tiers keep chaining (`.layer(a).layer(b)`); at render time they stack into
one figure.

`.layer()` is the **one** way to overlay a connector over a chart's own marks —
there is no separate `.connect()` method. It gives every tier the previous
tier's marks as scope, uniformly:

- An **empty `chart()` scope** (no data) inherits the previous tier's marks as
  chart data, so a full `.flow().mark()` pipeline can group, re-partition, or
  otherwise process them before drawing.
- A **bare relational mark** (`line()`, `ribbon()`) used directly, with no
  wrapping `chart()`, reads the previous tier's marks as the bag of refs it
  connects — this is the one-line sugar for the simple case.
- A **bare leaf mark** (`rect()`, `text()`, …) used directly is a
  component-level annotation: it ignores the scope entirely, since its channels
  have no ref-bag semantics to read.

## Blank-fusion: skip `.layer()` entirely for a fresh chart

When the connector's anchors don't exist yet either — there's no earlier tier
to draw from, just raw data — `line()`/`ribbon()` can go straight in `.mark()`
position and skip `.layer()` altogether:

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x", spacing: 64 }),
    gf.stack({ by: gf.field("species").sort("count"), dir: "y" })
  )
  .mark(gf.ribbon({ h: "count", fill: "species", opacity: 0.8 }))
  .render(root, { w: 400, h: 320 });
```

:::

No split option on the ribbon: it's fused directly over this chart's own
flow, and a fused relational mark splits at the flow's own grouping by
default — one tier lays the band's path, every other grouping splits it.
Here the `spread(lake)` tier lays the path and `stack({ by: "species" })`
splits, giving one band per species with nothing restated. When a _different_
tier should lay the path, name it with `along` (see [`ribbon`'s Default
grouping](/js/api/marks/ribbon#default-grouping) and
[`line`'s](/js/api/marks/line#default-grouping)) — it's only needed at all
for a path choice the flow's shape doesn't already imply.

### Desugaring

A relational mark placed directly in `.mark()` position elaborates to an
invisible anchor tier plus a connector tier:

```
.mark(R(opts))  ⇒  .mark(blank(anchor(opts))).layer(R(opts))
```

`anchor(opts)` is exactly the `{w, h, emX, emY}` subset of `opts` — the purely
spatial keys `blank()` itself accepts. Everything else (`fill`, `stroke`,
`strokeWidth`, `strokeDasharray`, `opacity`, `curve`, `dir`, `mixBlendMode`,
`along`, `source`, `target`) stays on the connector, matching what you'd write
by hand:

```js
// Fused
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: "species", dir: "y" })
  )
  .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }));

// ...is sugar for the explicit two-tier form:
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: "species", dir: "y" })
  )
  .mark(blank({ h: "count" }))
  .layer(ribbon({ fill: "species", opacity: 0.8 }));
```

A `.name(...)`/`.label(...)`/`.zOrder(...)` chained onto the relational mark
names/labels/orders the **connector** (the anchor tier still gets `.layer()`'s
usual auto-naming). This rule only fires when the chart's data still needs
anchors drawn for it — a relational mark applied directly to an existing bag
of refs (`chart(selectAll("bars")).mark(ribbon(opts))`, or the bare-mark tier
form documented above) keeps its unfused, direct-connect meaning; only the
pairwise `{from, to}` form is never fused either, since it already consumes
ref-bearing rows in `.mark()` position.

Reach for the explicit `.mark(blank(...)).layer(...)` form instead when the
anchor needs options besides `{w, h, emX, emY}` (a visible rect anchor, for
instance — see [`Ribbon`](/js/api/marks/ribbon)'s bar-chart example) or when
you want the anchor and connector opts kept visually separate.

## Ribbon — one-line sugar

The simple case — draw a ribbon over the marks you just drew, split into one
band per group — is a single `.layer(ribbon(...))` call, with no split option
needed: the ribbon is fused over this chart's own flow, so it picks up the
flow's grouping by default (see [`ribbon`'s Default
grouping](/js/api/marks/ribbon#default-grouping)). Pass `along: "<field>"`
only when a _different_ tier than the one inference picks should lay the
path:

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x", spacing: 64 }),
    gf.stack({ by: gf.field("species").sort("count"), dir: "y" })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .layer(gf.ribbon({ opacity: 0.8 }))
  .render(root, { w: 400, h: 320 });
```

:::

### Desugaring

`.layer(ribbon(...))` is sugar for the general `chart()`-tier form, which is
itself the same manual wiring you'd write with
[`layer([...])`](/js/api/operators/layer) and [`selectAll`](/js/api/selection/ref):

```js
// One-line sugar
chart(data, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: "species", dir: "y" })
  )
  .mark(rect({ h: "count", fill: "species" }))
  .layer(ribbon({ opacity: 0.8 }));

// ...is sugar for the general chart()-tier form:
chart(data, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: "species", dir: "y" })
  )
  .mark(rect({ h: "count", fill: "species" }).name("bars"))
  .layer(
    chart() // empty scope = the previous tier's marks
      .flow(group({ by: "species" }))
      .mark(ribbon({ opacity: 0.8 }))
  );

// ...which is itself sugar for the fully manual form:
layer([
  chart(data, { axes: true })
    .flow(
      spread({ by: "lake", dir: "x", spacing: 64 }),
      stack({ by: "species", dir: "y" })
    )
    .mark(rect({ h: "count", fill: "species" }).name("bars")),
  chart(selectAll("bars"))
    .flow(group({ by: "species" }))
    .mark(ribbon({ opacity: 0.8 }))
    .zOrder(-1),
]);
```

The general `chart()`-tier form (middle example) stays fully supported — reach
for it when the fused default (or `along`) isn't enough, e.g. when the
re-partition needs to compose with other operators in its own `.flow()`
(`derive`, a second `group()`, a different dataset entirely — see "Node-link"
below), or when the split isn't named by any single flow tier at all. This is
also the only place a connector still composes with a re-partition the way
`by` used to: an explicit `flow(group({ by: "..." }))` on the tier splits
first, and the ribbon/line then draws one connector per resulting group.

## Connector — a bare relational mark tier

For a line or ribbon with no re-partitioning at all, pass the connector mark
directly — no `by`, no wrapping `chart()`. It reads the previous tier's marks
as its bag of refs and threads one connector through all of them, painted
underneath:

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.chart(locations, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
  .layer(gf.line({ stroke: "black", strokeWidth: 2 }))
  .render(root, { w: 400, h: 300 });
```

:::

## Node-link — a tier with its own data

Pass `chart(table)` to drive the tier from a different dataset, then
[`resolve`](/js/api/operators/resolve) its reference columns back into the drawn
nodes and connect them with [`line({ from, to })`](/js/api/marks/line):

::: gofish

```js
const nodes = [
  { id: "a", grp: 0 },
  { id: "b", grp: 1 },
  { id: "c", grp: 1 },
  { id: "d", grp: 2 },
];
const edges = [
  { source: "a", target: "b" },
  { source: "a", target: "c" },
  { source: "b", target: "d" },
  { source: "c", target: "d" },
];

gf.chart(nodes)
  .flow(gf.scatter({ by: "id", x: "grp", y: "id" }))
  .mark(gf.circle({ r: 14, fill: "#4e79a7" }).name("nodes"))
  .layer(
    gf
      .chart(edges)
      .flow(gf.resolve(["source", "target"], { from: gf.selectAll("nodes") }))
      .mark(gf.line({ from: "source", to: "target", stroke: "#888" }))
  )
  .render(root, { w: 360, h: 360 });
```

:::

## Annotation — a bare mark tier

Pass a bare mark (`text(...)`, `rect(...)`, …) instead of a `chart(...)` to add a
**component-level annotation tier**: a datumless overlay — a threshold rule, a
caption — with no data pipeline of its own. Its accessor channels ignore the
datum, so use plain values or closures over your own signals.

::: gofish

```js
const sales = [
  { quarter: "Q1", revenue: 30 },
  { quarter: "Q2", revenue: 80 },
  { quarter: "Q3", revenue: 55 },
  { quarter: "Q4", revenue: 72 },
];

gf.chart(sales, { axes: true })
  .flow(gf.spread({ by: "quarter", dir: "x" }))
  .mark(gf.rect({ h: "revenue", fill: "#6b9bd1" }))
  .layer(gf.rect({ y: gf.datum(60), h: 3, w: 400, fill: "#333" })) // threshold rule (revenue units)
  .layer(gf.text({ x: 20, y: 24, text: "target: 60", fill: "#333" })) // caption
  .render(root, { w: 400, h: 300 });
```

:::

## Signature

```ts
.layer(child: ChartBuilder | Mark): LayerBuilder
```

## Parameters

| Parameter | Type                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `child`   | `ChartBuilder \| Mark` | The next tier. A `chart(...)` pipeline stacks a data-driven tier — an empty `chart()` scope inherits the previous tier's marks; `chart(table)` drives it from another dataset (resolve back with [`resolve`](/js/api/operators/resolve)). A bare relational mark (`line()`, `ribbon()`) reads the previous tier's marks as its bag of refs. A bare leaf mark (`rect()`, `text()`, …) is a component-level annotation overlay (datumless, ignores the scope). |

Returns a `LayerBuilder` — chain `.layer(...)` again for more tiers, then `.render()`.

## Semantics

- **Uniform scope** — every tier is handed the previous tier's marks as scope,
  whether that tier is an empty `chart()` (binds the scope as chart data), a
  bare relational mark (reads the scope as its ref bag), or a bare leaf mark
  (ignores the scope). Under the hood `.layer()` names the previous tier's mark
  and binds the next tier to `selectAll(thatName)` — the same wiring you'd
  write by hand, done for you.
- **Shared registry** — tiers resolve in order sharing one `layerContext`, so a
  later tier's `selectAll("name")` finds an earlier tier's `.name("name")`.
- **Chart-level options** — axes and color from the root `chart(data, { ... })` apply
  to the whole stack.
- **Paint order** — tiers paint in chain order (later tiers on top), like a
  manual [`layer([...])`](/js/api/operators/layer) — **except** relational
  marks (`line()`, `ribbon()`, in any call form: bag, fused/split, pairwise
  `{from, to}`, or the low-level combinator form inside a manual `layer([...])`),
  which default to painting `zBelow` whatever they reference. This is a real
  paint-order constraint, not a hardcoded z-index, so it composes with other
  constraints — a `line()` or `ribbon()` tier needs no zOrder incantation to
  sit under the marks it connects. An explicit `.zOrder(...)` or
  `.constrain(...)` on the connector's own chain overrides the default.
- **Field references on refs** — `by` / `resolve` read bare field names off the
  refs (`by: "species"`, not `by: "datum.species"`); a ref descends into its row
  bag automatically.

## `.layer(child)` vs. the `layer([...])` operator

This page documents the **v3 builder method** `ChartBuilder.layer(child)`, which
stacks a `chart(...)` tier over the current one and auto-wires an empty `chart()`
scope to the previous tier's marks. It's sugar over the lower-level
[`layer([...])` operator](/js/api/operators/layer) (which composes an explicit
array of already-built charts) — `.layer()` does the naming + `selectAll` wiring
for the common "draw, then build over what I drew" case.
