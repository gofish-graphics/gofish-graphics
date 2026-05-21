# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: starfish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).render(
    w=500, h=300, axes=True
)
```

## Signature

```python
chart(data, **options) -> ChartBuilder
```

## Parameters

| Parameter | Type                        | Description                                                                              |
| --------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `data`    | `list[dict]` \| `DataFrame` | The dataset to visualize, or [`select()`](#cross-chart-references) for a layer reference |
| `coord`   | keyword                     | Coordinate transform, e.g. `coord=clock()`                                               |
| `color`   | keyword                     | Color scale applied to all marks — `palette(...)` or `gradient(...)`                     |

Chart-level options are passed as keyword arguments:

```python
chart(data, color=palette("tableau10"))
chart(data, color=gradient("blues"), coord=clock())
```

Returns a `ChartBuilder` with [`.flow()`](/python/api/core/flow),
[`.mark()`](/python/api/core/mark), and [`.render()`](/python/api/core/render).

::: tip
Chart **size** is set on [`.render()`](/python/api/core/render), not `chart()` —
`render(w=500, h=300)`.
:::

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
