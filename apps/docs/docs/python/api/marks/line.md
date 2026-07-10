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
line(stroke=None, strokeWidth=None, strokeDasharray=None, opacity=None, curve=None, by=None) -> Mark
```

## Parameters

| Parameter         | Type                            | Description                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stroke`          | `str`                           | Line color                                                                                                                                                                                                                                                                                                                                                                                                    |
| `strokeWidth`     | `int`                           | Line width in pixels                                                                                                                                                                                                                                                                                                                                                                                          |
| `strokeDasharray` | `str`                           | Raw SVG `stroke-dasharray` (e.g. `"12"`) for a dashed line                                                                                                                                                                                                                                                                                                                                                    |
| `opacity`         | `float`                         | Opacity, `0`–`1`                                                                                                                                                                                                                                                                                                                                                                                              |
| `curve`           | `str \| dict`                   | Path shape; default `"auto"`, which auto-smooths continuous line charts                                                                                                                                                                                                                                                                                                                                       |
| `by`              | `str \| field(...) \| Callable` | Partitions the operand bag (the list of refs) into groups and draws one polyline per group. Same grammar as any operator's `by` — bare field name, key function, or [`field(...)`](/python/api/operators/spread#field-expression-pipeline) accessor. Resolves against the refs' own datum automatically (no `datum.` prefix), same as `group(by=...)`. Composes with an upstream `group()` as a nested split. |

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

## Sugar: `.layer(line(...))`

When the line connects a chart's _own_ marks, skip the two-chart `selectAll`
recipe and chain [`.layer()`](/python/api/core/layer) on the builder with a
bare `line(...)`:

```python
from gofish import chart, scatter, circle, line

chart(driving_shifts, axes=True).flow(
    scatter(by="year", x="miles", y="gas")
).mark(circle(r=4, fill="white", stroke="black", strokeWidth=2)).layer(
    line(stroke="black", strokeWidth=2)
).render(w=500, h=300)
```

See [`.layer()`](/python/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit
`layer([...])` + `selectAll` form (which is still what you want to connect
_another_ chart's marks).

## Examples

```python
# Styled line
chart(selectAll("points")).mark(line(stroke="black", strokeWidth=2))
```
