# circle

Draws a circle for each data item. The mark for scatter plots, bubble charts,
and dot-based glyphs.

::: starfish example:scatter-plot hidden
:::

```python
from gofish import chart, scatter, circle

chart(catch_locations, axes=True).flow(scatter(by="lake", x="x", y="y")).mark(
    circle(r=5)
).render(w=500, h=300)
```

## Signature

```python
circle(r=None, fill=None, stroke=None, strokeWidth=None, opacity=None,
       label=None, debug=None) -> Mark
```

## Parameters

| Parameter     | Type            | Description                             |
| ------------- | --------------- | --------------------------------------- |
| `r`           | `int` \| `str`  | Radius — a constant or a field name     |
| `fill`        | `str`           | Fill color — a constant or a field name |
| `stroke`      | `str`           | Stroke color                            |
| `strokeWidth` | `int`           | Stroke width in pixels                  |
| `opacity`     | `float`         | Opacity, `0`–`1`                        |
| `label`       | `bool` \| `str` | Whether/what to label the circle        |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Examples

```python
# Fixed-size dots
chart(data).flow(scatter(x="x", y="y")).mark(circle(r=5))

# Bubble chart — radius encodes a field
chart(data).flow(scatter(x="x", y="y")).mark(circle(r="population", fill="region"))

# Outlined dots
chart(data).flow(scatter(x="x", y="y")).mark(
    circle(r=4, fill="white", stroke="black", strokeWidth=2)
)
```
