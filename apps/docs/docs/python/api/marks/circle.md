---
order: 20
---

# circle

Draws a circle for each data item. The mark for scatter plots, bubble charts,
and dot-based glyphs. It is an `ellipse` locked to a 1:1 aspect ratio, and it
takes the same box dimensions.

The diameter is set by at most one of `r`, `area`, `w`, or `h`. A number is
pixels (square pixels for `area`), and a field name, `field(...)`, or function
is data.

- `r` is the radius, so the diameter is `2r` for every kind of value. A data
  `r` sizes both axes.
- `area` is the circle's area. It is an area channel: it sums the mark's rows
  and hands the circle the square root of the sum, so the area, not the
  radius, is proportional to the value. A data `area` sizes both axes.
- `w` or `h` is the diameter along that axis. A data `w` or `h` sizes only
  that axis, and the other axis follows it in pixels.

With none of them, the circle fills the space it is given. Passing more than
one is an error.

::: gofish example:scatter-plot hidden
:::

```python
from gofish import chart, scatter, circle

chart(catch_locations, axes=True).flow(scatter(by="lake", x="x", y="y")).mark(
    circle(r=5)
).render(w=500, h=300)
```

## Signature

```python
circle(r=None, area=None, w=None, h=None, x=None, cx=None, x2=None, y=None, cy=None,
       y2=None, em_x=None, em_y=None, dims=None, fill=None, stroke=None,
       stroke_width=None, opacity=None, fill_opacity=None, debug=None) -> Mark
```

## Parameters

::: gofish-ref circle
:::

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark). To attach a
text label, chain [`.label(accessor, ...)`](/python/api/core/mark#labeling-a-mark)
on the returned mark rather than passing a `label` option here.

## Examples

```python
# Fixed-size dots
chart(data).flow(scatter(x="x", y="y")).mark(circle(r=5))

# Bubble chart — radius encodes a field
chart(data).flow(scatter(x="x", y="y")).mark(circle(r="population", fill="region"))

# Area proportional to a field, one circle per lake
chart(data).flow(spread(by="lake", dir="x")).mark(circle(area="count", fill="lake"))

# Diameter read against the y axis
chart(data).flow(spread(by="category", dir="x")).mark(circle(h="value"))

# Outlined dots
chart(data).flow(scatter(x="x", y="y")).mark(
    circle(r=4, fill="white", stroke="black", stroke_width=2)
)
```
