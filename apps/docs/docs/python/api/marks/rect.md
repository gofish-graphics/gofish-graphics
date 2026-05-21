# rect

Draws a rectangle for each data item. The most common mark — bars, stacked
bars, mosaic tiles, and waffle cells are all rectangles.

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
rect(w=None, h=None, fill=None, stroke=None, strokeWidth=None, opacity=None,
     rx=None, ry=None, **options) -> Mark
```

## Parameters

| Parameter                        | Type            | Description                                 |
| -------------------------------- | --------------- | ------------------------------------------- |
| `w`, `h`                         | `int` \| `str`  | Width / height — a constant or a field name |
| `fill`                           | `str`           | Fill color — a constant or a field name     |
| `stroke`                         | `str`           | Stroke color                                |
| `strokeWidth`                    | `int`           | Stroke width in pixels                      |
| `opacity`                        | `float`         | Opacity, `0`–`1`                            |
| `rx`, `ry`                       | `int`           | Corner radii                                |
| `x`, `y`, `cx`, `cy`, `x2`, `y2` | `int` \| `str`  | Explicit position accessors                 |
| `label`                          | `bool` \| `str` | Whether/what to label the rectangle         |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

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
