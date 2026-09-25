---
order: 10
---

# rect

Draws a rectangle for each data item. The most common mark — bars, stacked
bars, mosaic tiles, and waffle cells are all rectangles.

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).render(
    w=500, h=300, axes=True
)
```

## Signature

```python
rect(*, x=None, cx=None, x2=None, w=None, emX=None,
     y=None, cy=None, y2=None, h=None, emY=None,
     dims=None,
     fill=None, stroke=None, strokeWidth=None, opacity=None, filter=None,
     rx=None, ry=None, aspectRatio=None, key=None) -> Mark
```

Closed signature — no catch-all `**kwargs`. An unrecognized keyword raises a
`TypeError` at the call site instead of being accepted and then quietly ignored
at render time, which is the class of bug that motivated closing it (see
[Frontend IR](/internals/frontend/serialization#generating-the-python-factory-layer)).

## Parameters

::: gofish-ref rect
:::

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark). To attach a
text label, chain [`.label(accessor, ...)`](/python/api/core/mark#labeling-a-mark)
on the returned mark rather than passing a `label` option here.

## Axis names

`x`, `y`, `w`, and `h` mean the first and second axis in any coordinate space.
Under [`polar`](/python/api/coords/polar) that is the angle and the radius.

To use the names a coordinate space gives its axes, pass them in the `dims`
dict. Each key is an axis name, and each value is either a position (like `x`)
or a dict with any of `"min"`, `"center"`, `"max"`, `"size"`, and
`"embedded"`:

```python
# Inside polar(): the same wedge as rect(w=0.4, h="value")
rect(dims={"theta": {"size": 0.4}, "r": {"size": "value"}})
```

`"x"` and `"y"` are always valid keys too. A name the enclosing coordinate
space does not declare raises an error that lists the ones it does, and setting
the same part of an axis twice (for example `w` and `dims["theta"]["size"]`) is
an error. `dims` is the one keyword for axis names, so the rest of the
signature stays closed. The same keyword works on `ellipse`, `petal`, `text`,
`image`, and `layer`.

## Encoding

Each option takes a **constant** or a **field name** (a string column in your
data):

```python
rect(h="count", fill="species")  # height and color from fields
rect(h="count", fill="#4e79a7")  # height from data, constant color
rect(w=20, h="count")            # constant width, data-driven height
```

## Examples

```python
# Stacked bars
chart(seafood).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species"))

# Rounded, outlined tiles
chart(data).mark(rect(h="count", rx=4, stroke="white", strokeWidth=2))
```
