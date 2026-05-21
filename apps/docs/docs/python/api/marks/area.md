# area

Fills the region between a baseline and a set of data points. Like
[`line`](/python/api/marks/line), an area traces a layout produced by another
chart, selected with [`select()`](/python/api/core/chart#cross-chart-references).

::: starfish example:area-chart hidden
:::

```python
from gofish import Layer, chart, spread, blank, select, area

Layer([
    chart(lake_totals)
        .flow(spread(by="lake", dir="x", spacing=64))
        .mark(blank(h="count").name("points")),
    chart(select("points")).mark(area(opacity=0.8)),
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
selects them and draws the `area()`. Stack several areas in one `Layer` — with
`opacity` or `mixBlendMode` — for layered and stacked area charts.

## Examples

```python
# Semi-transparent area
chart(select("points")).mark(area(opacity=0.8))
```
