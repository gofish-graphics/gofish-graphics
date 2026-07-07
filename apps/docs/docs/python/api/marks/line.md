# line

Connects data points with a line. A line draws **through** a set of points, so
it is most often paired with [`selectAll()`](/python/api/core/chart#cross-chart-references)
to trace a layout produced by another chart. `selectAll` hands `line` an array
of refs, and the line reads placed geometry off them.

::: gofish example:line-chart hidden
:::

```python
from gofish import layer, chart, scatter, blank, selectAll, line

layer([
    chart(catch_locations)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points")),
    chart(selectAll("points")).mark(line()),
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
2. A second chart selects that layer — `chart(selectAll("points"))` — and draws
   a `line()` through it.
3. `layer([...])` composes the two.

This separation lets the same positioned points back both a line and, say,
circles drawn on top.

## Sugar: `.connect()`

When the line connects a chart's _own_ marks, skip the two-chart `selectAll`
recipe and chain [`.connect()`](/python/api/core/connect) on the builder:

```python
chart(data).flow(
    scatter(by="lake", x="x", y="y")
).mark(circle()).connect(line(stroke="steelblue", strokeWidth=2))
```

See [`.connect()`](/python/api/core/connect) for the full semantics; the
explicit `layer([...])` + `selectAll` form connects _another_ chart's marks.

## Examples

```python
# Styled line
chart(selectAll("points")).mark(line(stroke="black", strokeWidth=2))
```
