# layer

Stack another tier over the current one. `.layer(child)` takes a whole
`chart(...)` pipeline as its argument: an **empty `chart()` scope** (no data)
inherits the previous tier's marks — so you can connect, group, or annotate what
you just drew without naming it — while `chart(table)` drives the tier from
another dataset. `.layer(...)` returns a `LayerBuilder`, so tiers keep chaining
(`.layer(a).layer(b)`); at render time they stack into one figure.

It generalizes [`.connect()`](/js/api/core/connect): where `.connect(line())`
threads a single ref-consuming mark under the chart, `.layer()` gives the next
tier a full `.flow().mark()` pipeline.

## Ribbon — empty scope inherits the previous marks

`chart()` with no data re-enters with the bars you just drew, grouped into bands
by [`group`](/js/api/operators/group):

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x", spacing: 64 }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .layer(
    gf
      .chart() // empty scope = the previous tier's marks
      .flow(gf.group({ by: "species" }))
      .mark(gf.area({ opacity: 0.8 }))
  )
  .render(root, { w: 400, h: 320 });
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

| Parameter | Type                   | Description                                                                                                                                                                                                                                                                                                  |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `child`   | `ChartBuilder \| Mark` | The next tier. A `chart(...)` pipeline stacks a data-driven tier — an empty `chart()` scope inherits the previous tier's marks; `chart(table)` drives it from another dataset (resolve back with [`resolve`](/js/api/operators/resolve)). A bare `Mark` is a component-level annotation overlay (datumless). |

Returns a `LayerBuilder` — chain `.layer(...)` again for more tiers, then `.render()`.

## Semantics

- **Empty scope** — an empty `chart()` tier resolves to exactly the nodes the
  previous tier's mark produced, one per flow leaf. Under the hood `.layer()`
  names the previous tier's mark and binds the empty tier to
  `selectAll(thatName)` — the same wiring you'd write by hand, done for you.
- **Shared registry** — tiers resolve in order sharing one `layerContext`, so a
  later tier's `selectAll("name")` finds an earlier tier's `.name("name")`.
- **Chart-level options** — axes and color from the root `chart(data, { ... })` apply
  to the whole stack.
- **Paint order** — tiers paint in chain order (later tiers on top), like a
  manual [`layer([...])`](/js/api/operators/layer).
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
