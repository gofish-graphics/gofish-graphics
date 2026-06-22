# connect

Draws a connector through the chart's own marks. `.connect(line())` is builder
sugar for the two-layer `selectAll` recipe: it positions the chart's marks, then
threads a [`line`](/js/api/marks/line) or [`area`](/js/api/marks/area) through
exactly those nodes, painted underneath.

> For anything beyond a single connector mark — grouping the marks into bands, or
> driving a second tier from another table — reach for the more general
> [`.layer()`](/js/api/core/layer), which gives the next tier a full
> `.flow().mark()` pipeline. `.connect(m)` is the one-mark shorthand.

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.chart(locations, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle())
  .connect(gf.line({ stroke: "steelblue", strokeWidth: 2 }))
  .render(root, { w: 400, h: 300 });
```

:::

## Signature

```ts
.connect(connectorMark)
```

## Parameters

| Parameter       | Type                | Description                                                                                       |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `connectorMark` | `Mark<GoFishRef[]>` | A ref-consuming mark — typically [`line()`](/js/api/marks/line) or [`area()`](/js/api/marks/area) |

Returns a new `ChartBuilder` — `connect` is immutable.

## Desugaring

`.connect()` is exactly the manual two-layer form. This:

```ts
chart(data, { axes: true })
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(circle())
  .connect(line());
```

desugars to:

```ts
layer([
  chart(data)
    .flow(scatter({ by: "lake", x: "x", y: "y" }))
    .mark(circle().name("pts")),
  chart(selectAll("pts")).mark(line()).zOrder(-1),
]);
```

The elaboration happens at resolve time (like axes and legends), so the sugar
keeps the IR small and never leaks an extra layer into your code.

## Semantics

- **Targets** are exactly the nodes the chart's final mark registers — one per
  flow leaf, identical to what `selectAll(name)` yields in the manual form.
- **Name** — if the mark carries a string `.name("pts")`, that name is used (and
  stays selectable by other charts). Otherwise no name is created at all: the
  chart tags its mark's nodes directly at resolve time, so nothing is minted,
  leaked, or serialized.
- **Paint order** — the connector renders **under** the marks (the elaboration
  applies `zOrder(-1)` to the connector layer). This is fixed; reach for the
  manual `layer([...])` form if you need a different paint order.
- **Connector type** — any `Mark<GoFishRef[]>` works: [`line()`](/js/api/marks/line),
  [`area()`](/js/api/marks/area).

## Constraints

- **One call max.** A second `.connect()` throws.
- **String names only.** A token (non-string) mark name throws.
- **Cross-chart connection** — to connect _another_ chart's marks, use the
  explicit [`layer([...])`](/js/api/operators/layer) +
  [`selectAll`](/js/api/selection/ref) form. `.connect()` only threads a chart
  through its own marks.

## Builder `.connect()` vs. the low-level `Connect` operator

This page documents the **v3 builder method** `ChartBuilder.connect()`. It is
distinct from the lower-level [`connect` / `Connect` operator](/js/api/operators/connect),
which draws a connector between explicitly-listed `ref(...)` children inside a
layout (anchor/edge modes, source/target anchors). The builder sugar wraps a
ref-consuming _mark_ (`line` / `area`); the operator is a _layout primitive_ you
place children into directly.
