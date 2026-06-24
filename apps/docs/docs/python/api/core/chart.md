# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

## Signature

```python
chart(data, **options) -> ChartBuilder
```

## Parameters

| Parameter     | Type                        | Description                                                                                                        |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data`        | `list[dict]` \| `DataFrame` | The dataset to visualize, or [`selectAll()` / `ref()`](#cross-chart-references) for a layer reference              |
| `axes`        | keyword                     | Auto-generate axes, labels, and legends. See [Axes](#axes) below.                                                  |
| `coord`       | keyword                     | Coordinate transform, e.g. `coord=clock()`                                                                         |
| `color`       | keyword                     | Color scale applied to all marks — `palette(...)` or `gradient(...)`                                               |
| `padding`     | keyword                     | Extra SVG padding (px) — useful for polar charts and overflowing labels                                            |

Chart-level options are passed as keyword arguments:

```python
chart(data, color=palette("tableau10"))
chart(data, color=gradient("blues"), coord=clock())
```

Returns a `ChartBuilder` with [`.flow()`](/python/api/core/flow),
[`.mark()`](/python/api/core/mark), and [`.render()`](/python/api/core/render).

::: tip
Chart **size** is set on [`.render()`](/python/api/core/render), not `chart()` —
`render(w=500, h=300)`. Everything else (`axes`, `coord`, `color`, `padding`)
is a `chart()` option.
:::

## Axes

`axes` is a `chart()` option (mirroring the JS `chart(data, { axes: true })`).
It accepts a bool, a per-dimension dict, or per-dimension title control:

```python
chart(data, axes=True)                       # both axes, titles inferred
chart(data, axes=False)                       # no axes
chart(data, axes={"x": True, "y": False})     # x only
chart(data, axes={"x": {"title": "Year"}, "y": True})   # custom x title
chart(data, axes={"x": {"title": False}, "y": True})    # suppress inferred x title
```

For polar charts, combine with `coord` (and `padding` for label room):

```python
chart(seafood, coord=clock(), axes=True, padding=80)
```

Per-operator overrides use the same shape on
[`spread`](/python/api/operators/spread) / [`scatter`](/python/api/operators/scatter):

```python
chart(data, axes=True).flow(spread(by="species", dir="x", axes={"x": True, "y": False}))
```

## Equal scale from a shared measure

By default each axis resolves its data→pixel scale independently, so a circle in
data space becomes an ellipse. But when **x and y are the same unit of measure**,
their scales must be equal — a circle stays circular. GoFish does this from the
**measure**, not a knob: tag both channels with the same measure via
`field(name, measure)` and the shared scale follows.

```python
(
    chart(data)
    .flow(scatter(x=field("x", "plane"), y=field("y", "plane")))
    .mark(circle(r=4))
    .render(w=640, h=380)  # a true circle, not an ellipse
)
```

This is the same rule the `circle` mark obeys one level down: `circle(r=...)`
lowers to a `w` and `h` that share a measure, so it can never distort. The
binding axis fills its dimension; the other centers in the leftover space.
Tagging the two axes the same is a unit claim — different measures (e.g.
`bill_length` vs `bill_depth`, both mm) stay independent.

## The builder

Every builder method returns a **new** `ChartBuilder`, so chains are immutable
and safe to reuse:

```python
base = chart(seafood).flow(spread(by="lake", dir="x"))
bars = base.mark(rect(h="count"))
dots = base.mark(circle(r="count"))
```

## Convenience methods

`.facet()` and `.stack()` are shortcuts for common single-operator flows:

```python
chart(seafood).facet(by="lake", dir="x").mark(rect(h="count"))
# equivalent to
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

## Cross-chart references

Pass `selectAll("layerName")` as the data argument to reference a named mark from
another chart — it resolves to an **array of refs**, one per named node, which
connectors like [`line`](/python/api/marks/line) and [`area`](/python/api/marks/area)
consume directly. Use `ref("layerName")` as data for the singular case: it returns a
**single ref** and raises if the layer matched zero or more than one node.

After a selection the stream is refs, so re-encode with a datum path —
`group(by="datum.species")`; see
[`spread` → path-aware `by`](/python/api/operators/spread#path-aware-by). See
[`mark`](/python/api/core/mark) for `.name()` on a mark.

For the full reference — singular-as-data rules, node-unit selection, hygienic
scoping, and connector use — see [`ref` / `selectAll`](/python/api/selection/ref).

## Naming a chart: `.name()`

A **chart-level** `.name()` — distinct from naming a mark — tags the whole
chart so a sibling `layer([...]).constrain(...)` callback can reference it by
that name (mirrors JS `chart.resolve().name(...)`). The constrain lambda's
parameter names match the charts' `.name()` strings:

```python
sc = chart(data).flow(scatter(x="x", y="y")).mark(circle(r=3)).name("scatter")
top = chart(data, h=80).flow(...).mark(rect(h="count")).name("topHist")

layer([sc, top]).constrain(lambda scatter, topHist: [
    Constraint.align([scatter], x="baseline", y="baseline"),
    Constraint.position([topHist], y=410, anchor="start"),
])
```
