# blank

An invisible mark. `blank` takes up space and can be positioned and named like
any other mark, but draws nothing. It is the positioning **guide** that
[`line`](/python/api/marks/line) and [`area`](/python/api/marks/area) trace.

::: gofish example:area-chart hidden
:::

```python
from gofish import layer, chart, spread, blank, selectAll, area

layer([
    chart(lake_totals)
        .flow(spread(by="lake", dir="x", spacing=64))
        .mark(blank(h="count").name("points")),
    chart(selectAll("points")).mark(area(opacity=0.8)),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
blank(w=None, h=None, **options) -> Mark
```

## Parameters

| Parameter | Type           | Description                                 |
| --------- | -------------- | ------------------------------------------- |
| `w`, `h`  | `int` \| `str` | Width / height — a constant or a field name |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Why use a blank?

A `blank` lets you run a full layout — `spread`, `stack`, `scatter` — and capture
the **positions** without drawing anything. Name the result with `.name(...)`,
then have another chart [`selectAll()`](/python/api/core/chart#cross-chart-references)
it and draw a [`line`](/python/api/marks/line), [`area`](/python/api/marks/area),
or other mark through those positions.

```python
# Position points, draw nothing — then connect them
chart(data).flow(scatter(by="lake", x="x", y="y")).mark(blank().name("points"))
chart(selectAll("points")).mark(line())
```

## Notes

- A `blank` still occupies layout space; its `w`/`h` participate in scales and
  positioning even though nothing is painted.
