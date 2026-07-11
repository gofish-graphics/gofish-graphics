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
     theta=None, thetaSize=None, r=None, rSize=None,
     fill=None, stroke=None, strokeWidth=None, opacity=None, filter=None,
     rx=None, ry=None, aspectRatio=None, key=None) -> Mark
```

Closed signature — no catch-all `**kwargs`. An unrecognized keyword is a
`TypeError` at the call site, not a value that silently serializes and gets
dropped on the floor at render (the class of bug that motivated closing it —
see [Frontend IR](/internals/frontend/serialization#generating-the-python-factory-layer)).

## Parameters

| Parameter                          | Type           | Description                                                                   |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `w`, `h`                           | `int` \| `str` | Width / height — a constant or a field name                                   |
| `fill`                             | `str`          | Fill color — a constant or a field name                                       |
| `stroke`                           | `str`          | Stroke color                                                                  |
| `strokeWidth`                      | `int`          | Stroke width in pixels                                                        |
| `opacity`                          | `float`        | Opacity, `0`–`1`                                                              |
| `filter`                           | `str`          | Raw SVG filter attribute                                                      |
| `rx`, `ry`                         | `int`          | Corner radii                                                                  |
| `aspectRatio`                      | `float`        | `w`/`h` ratio to enforce; the data-driven axis wins when both are data-driven |
| `x`, `y`, `cx`, `cy`, `x2`, `y2`   | `int` \| `str` | Explicit position accessors                                                   |
| `theta`, `thetaSize`, `r`, `rSize` | `int` \| `str` | Polar coord-space aliases for `x`/`w`/`y`/`h`                                 |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark). To attach a
text label, chain [`.label(accessor, ...)`](/python/api/core/mark#labeling-a-mark)
on the returned mark rather than passing a `label` option here.

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
