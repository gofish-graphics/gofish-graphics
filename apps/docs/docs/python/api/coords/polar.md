---
order: 10
---

# polar

Transforms Cartesian coordinates into a polar coordinate system. The x-axis maps to angle (theta) and the y-axis maps to radius.

::: gofish example:polar-ribbon-chart hidden
:::

```python
from gofish import chart, stack, rect, polar

chart(seafood, coord=polar()) \
    .flow(stack(by="species", dir="x")) \
    .mark(rect(w="count", fill="species")) \
    .render(w=400, h=300)
```

## Signature

```python
polar(
    inner_radius: float | None = None,   # donut hole, fraction [0,1) of outer radius
    central_angle: float | None = None,  # total sweep in radians (default 2π)
    start_angle: float | None = None,    # angle (radians) of θ=0 (default π/2)
    direction: int | None = None,        # +1 CCW, -1 CW (default -1)
    center: tuple[float, float] | None = None,  # screen-space center offset
) -> Coord
```

## Parameters

All optional; the defaults reproduce a centered, full-circle disc starting at 12
o'clock and going clockwise.

::: gofish-ref polar
:::

## Axis names

In every coordinate space, `x`, `y`, `w`, and `h` refer to the first and
second axis. Under polar, the first axis is the angle and the second is the
radius, so `w` is an angular extent and `h` is a radial one.

Polar also declares its own names for the two axes: `theta` for the angle and
`r` for the radius. You can use them in two places:

- in a mark's `dims` keyword, a dict keyed by axis name. A plain value is a
  position, like `x`. A dict names the parts of the axis you want to set:
  `"min"`, `"center"`, `"max"`, `"size"`, and `"embedded"`.
- in an operator's `dir`, as in `stack(dir="theta")`.

```python
chart(data, coord=polar()) \
    .flow(spread(by="category", dir="theta")) \
    .mark(rect(dims={"theta": {"size": 0.4}, "r": {"size": "value"}},
               emX=True, emY=True))
```

This is the same chart as `spread(by="category", dir="x")` with
`rect(w=0.4, h="value", emX=True, emY=True)`. The names only work inside a
coordinate space that declares them; anywhere else, `"theta"` raises an error
that lists the names you can use there.

Each part of an axis can be set once. `w=0.4` together with
`dims={"theta": {"size": 0.4}}` is an error, because both set the angular size.
`x=0` together with `dims={"theta": {"size": 0.4}}` is fine.

A circle's own `r` keyword is still its radius. The polar `r` axis only appears
as a key inside `dims`, so `scatter(by="id", dims={"theta": "bearing", "r":
"distance"})` with `circle(r=4)` places each dot by bearing and distance and
draws it with radius 4.

## Usage

Pass the coordinate transform to [`chart`](/python/api/core/chart) via the
`coord` keyword:

```python
chart(data, coord=polar()) \
    .flow(...) \
    .mark(...) \
    .render(w=400, h=300)
```

## Coordinate Mapping

| Cartesian | Polar                  |
| --------- | ---------------------- |
| x         | angle (theta), 0 to 2π |
| y         | radius from center     |

## Examples

```python
# Basic polar chart
chart(data, coord=polar()) \
    .flow(stack(by="category", dir="x")) \
    .mark(rect(w="value"))

# Polar with spread for radial segments
chart(data, coord=polar()) \
    .flow(spread(by="month", dir="x")) \
    .mark(rect(w=1, h="value"))

# Donut: a hollow center (inner radius = 50% of the outer radius)
chart(data, coord=polar(inner_radius=0.5)) \
    .flow(stack(by="category", dir="x")) \
    .mark(rect(w="value"))

# Partial fan: a 270° sweep instead of the full circle
import math
chart(data, coord=polar(central_angle=3 * math.pi / 2)) \
    .flow(spread(by="month", dir="x")) \
    .mark(rect(w=1, h="value"))
```

## See Also

- [clock](/python/api/coords/clock) — Similar to polar but with 0° at 12 o'clock
