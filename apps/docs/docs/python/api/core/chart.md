# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: starfish example:bar-chart hidden
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

| Parameter | Type                        | Description                                                                              |
| --------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `data`    | `list[dict]` \| `DataFrame` | The dataset to visualize, or [`select()`](#cross-chart-references) for a layer reference |
| `axes`    | keyword                     | Auto-generate axes, labels, and legends. See [Axes](#axes) below.                        |
| `coord`   | keyword                     | Coordinate transform, e.g. `coord=clock()`                                               |
| `color`   | keyword                     | Color scale applied to all marks — `palette(...)` or `gradient(...)`                     |
| `padding` | keyword                     | Extra SVG padding (px) — useful for polar charts and overflowing labels                  |

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

`axes` is a `chart()` option (mirroring the JS `Chart(data, { axes: true })`).
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

Pass `select("layerName")` as the data argument to reference a named mark from
another chart. See [`mark`](/python/api/core/mark) for `.name()`.
