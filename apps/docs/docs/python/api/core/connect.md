# connect

Draws a connector through the chart's own marks. `.connect(line())` is builder
sugar for the two-layer `selectAll` recipe: it positions the chart's marks, then
threads a [`line`](/python/api/marks/line) or [`area`](/python/api/marks/area)
through exactly those nodes, painted underneath.

::: starfish example:connected-scatter-sugar hidden
:::

```python
from gofish import chart, scatter, circle, line

chart(catch_locations, axes=True).flow(
    scatter(by="lake", x="x", y="y")
).mark(circle()).connect(line(stroke="steelblue", strokeWidth=2)).render(w=400, h=300)
```

## Signature

```python
ChartBuilder.connect(mark) -> ChartBuilder
```

## Parameters

| Parameter | Type   | Description                                                                                               |
| --------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `mark`    | `Mark` | A ref-consuming mark — typically [`line()`](/python/api/marks/line) or [`area()`](/python/api/marks/area) |

Returns a new `ChartBuilder` with the connector set.

## Desugaring

`.connect()` is exactly the manual two-layer form. This:

```python
chart(data, axes=True).flow(
    scatter(by="lake", x="x", y="y")
).mark(circle()).connect(line())
```

desugars to:

```python
Layer([
    chart(data).flow(scatter(by="lake", x="x", y="y")).mark(circle().name("pts")),
    chart(selectAll("pts")).mark(line()).zOrder(-1),
])
```

The elaboration happens at resolve time (like axes and legends), so the sugar
keeps the IR small and never leaks an extra layer into your code.

## Semantics

- **Targets** are exactly the nodes the chart's final mark registers — one per
  flow leaf, identical to what `selectAll(name)` yields in the manual form.
- **Name** — if the mark carries a string `.name("pts")`, that name is used (and
  stays selectable by other charts). Otherwise a hygienic auto-generated name is
  used at resolve time and never appears anywhere user-visible (including
  serialized IR).
- **Paint order** — the connector renders **under** the marks (the elaboration
  applies `zOrder(-1)` to the connector layer).
- **Connector type** — any ref-consuming mark works:
  [`line()`](/python/api/marks/line), [`area()`](/python/api/marks/area).

## Constraints

- **One call max.** A second `.connect()` raises `ValueError`.
- **String names only.** A non-string mark name raises `TypeError`.
- **Connector sits under the marks** — reach for the manual `Layer([...])` form
  if you need a different paint order.
- **Cross-chart connection** — to connect _another_ chart's marks, use the
  explicit `Layer([...])` + [`selectAll`](/python/api/selection/ref) form.
  `.connect()` only threads a chart through its own marks.
