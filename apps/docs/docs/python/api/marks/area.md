# area

Fills the region between a baseline and a set of data points. Like
[`line`](/python/api/marks/line), an area traces a layout produced by another
chart, selected with [`selectAll()`](/python/api/core/chart#cross-chart-references)
— an array of refs whose placed geometry the area reads.

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
area(stroke=None, strokeWidth=None, opacity=None, mixBlendMode=None,
     dir=None, interpolation=None) -> Mark
```

## Parameters

| Parameter       | Type    | Description                                        |
| --------------- | ------- | -------------------------------------------------- |
| `stroke`        | `str`   | Outline color                                      |
| `strokeWidth`   | `int`   | Outline width in pixels                            |
| `opacity`       | `float` | Opacity, `0`–`1`                                   |
| `mixBlendMode`  | `str`   | CSS blend mode for overlapping areas               |
| `dir`           | `str`   | Direction the area fills toward                    |
| `interpolation` | `str`   | Curve interpolation, e.g. `"linear"`, `"monotone"` |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## The area pattern

Areas use the same two-chart recipe as [`line`](/python/api/marks/line#the-line-pattern):
one chart positions named [`blank`](/python/api/marks/blank) marks, a second
`selectAll`s them and draws the `area()`. `selectAll(name)` reads a named layer
from an earlier chart as an array of refs, and `layer([chartA, chartB])` composes
multiple charts into one figure. To re-partition the selection first (e.g. one
area per series), run it through `group(by="datum.field")` — see
[`group`](/python/api/operators/group).

Stack several areas in one `layer` — with `opacity` or `mixBlendMode` — for
layered and stacked area charts.

## Sugar: `.connect()`

When the area traces a chart's _own_ marks, skip the two-chart `selectAll`
recipe and chain [`.connect()`](/python/api/core/connect) on the builder:

```python
chart(data).flow(
    spread(by="lake", dir="x")
).mark(blank(h="count")).connect(area(opacity=0.6))
```

See [`.connect()`](/python/api/core/connect) for the full semantics; the
explicit `layer([...])` + `selectAll` form traces _another_ chart's marks.

## Examples

```python
# Semi-transparent area
chart(selectAll("points")).mark(area(opacity=0.8))
```
