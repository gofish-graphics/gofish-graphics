# line

Connects data points with a line. A line draws **through** a set of points, so
it is most often paired with [`select()`](/python/api/core/chart#cross-chart-references)
to trace a layout produced by another chart.

::: starfish example:line-chart hidden
:::

```python
from gofish import Layer, chart, scatter, blank, select, line

Layer([
    chart(catch_locations)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points")),
    chart(select("points")).mark(line()),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
line(stroke=None, strokeWidth=None, opacity=None, interpolation=None) -> Mark
```

## Parameters

| Parameter       | Type    | Description                                        |
| --------------- | ------- | -------------------------------------------------- |
| `stroke`        | `str`   | Line color                                         |
| `strokeWidth`   | `int`   | Line width in pixels                               |
| `opacity`       | `float` | Opacity, `0`–`1`                                   |
| `interpolation` | `str`   | Curve interpolation, e.g. `"linear"`, `"monotone"` |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## The line pattern

A line needs points to connect. The idiomatic recipe:

1. One chart positions invisible [`blank`](/python/api/marks/blank) marks and
   names the layer with `.name("points")`.
2. A second chart selects that layer — `chart(select("points"))` — and draws a
   `line()` through it.
3. `Layer([...])` composes the two.

This separation lets the same positioned points back both a line and, say,
circles drawn on top.

## Examples

```python
# Styled line
chart(select("points")).mark(line(stroke="black", strokeWidth=2))
```
