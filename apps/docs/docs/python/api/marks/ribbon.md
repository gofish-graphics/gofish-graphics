# ribbon

Fills the region between a baseline and a set of data points as a filled band.
Like [`line`](/python/api/marks/line), a ribbon traces a layout produced by
another chart, selected with [`selectAll()`](/python/api/core/chart#cross-chart-references)
— an array of refs whose placed geometry the ribbon reads.

::: gofish example:area-chart hidden
:::

```python
from gofish import layer, chart, spread, blank, selectAll, ribbon

layer([
    chart(lake_totals)
        .flow(spread(by="lake", dir="x", spacing=64))
        .mark(blank(h="count").name("points")),
    chart(selectAll("points")).mark(ribbon(opacity=0.8)),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
ribbon(stroke=None, strokeWidth=None, opacity=None, mixBlendMode=None,
     dir=None, curve=None) -> Mark
```

## Parameters

| Parameter      | Type          | Description                               |
| -------------- | ------------- | ----------------------------------------- |
| `stroke`       | `str`         | Outline color                             |
| `strokeWidth`  | `int`         | Outline width in pixels                   |
| `opacity`      | `float`       | Opacity, `0`–`1`                          |
| `mixBlendMode` | `str`         | CSS blend mode for overlapping areas      |
| `dir`          | `str`         | Direction the ribbon fills toward         |
| `curve`        | `str \| dict` | Screen-space path shape; default `"auto"` |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## The ribbon pattern

Ribbons use the same two-chart recipe as [`line`](/python/api/marks/line#the-line-pattern):
one chart positions named [`blank`](/python/api/marks/blank) marks, a second
`selectAll`s them and draws the `ribbon()`. `selectAll(name)` reads a named layer
from an earlier chart as an array of refs, and `layer([chartA, chartB])` composes
multiple charts into one figure. To re-partition the selection first (e.g. one
ribbon per series), run it through `group(by="datum.field")` — see
[`group`](/python/api/operators/group).

Stack several ribbons in one `layer` — with `opacity` or `mixBlendMode` — for
layered and stacked area charts.

## Sugar: `.connect()`

When the ribbon traces a chart's _own_ marks, skip the two-chart `selectAll`
recipe and chain [`.connect()`](/python/api/core/connect) on the builder:

```python
chart(data).flow(
    spread(by="lake", dir="x")
).mark(blank(h="count")).connect(ribbon(opacity=0.6))
```

See [`.connect()`](/python/api/core/connect) for the full semantics; the
explicit `layer([...])` + `selectAll` form traces _another_ chart's marks.

## Examples

```python
# Semi-transparent ribbon
chart(selectAll("points")).mark(ribbon(opacity=0.8))
```
