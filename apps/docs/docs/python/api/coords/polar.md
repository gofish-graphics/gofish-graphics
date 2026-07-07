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

| Option          | Default  | Description                                                   |
| --------------- | -------- | ------------------------------------------------------------- |
| `inner_radius`  | `0`      | Donut hole as a fraction `[0,1)` of the outer radius.         |
| `central_angle` | `2π`     | Total angular sweep in radians (use `<2π` for a partial fan). |
| `start_angle`   | `π/2`    | Angle (radians) where θ=0 sits (`π/2` = 12 o'clock).          |
| `direction`     | `-1`     | `+1` counter-clockwise, `-1` clockwise.                       |
| `center`        | `[0, 0]` | Screen-space center offset.                                   |

## Axis aliases

Inside a polar `coord`, dimensions can be named by their polar axis: `theta` (= `x`,
angular position) and `r` (= `y`, radius), with extents `thetaSize` (= `w`) and
`rSize` (= `h`). Like `emX`/`emY`, these mark options are camelCase. They coexist
with `x`/`y` and are **scope-bounded** — valid only inside a coord that declares them.
The operator `dir` accepts the angular/radial aliases too.

```python
chart(data, coord=polar()) \
    .flow(spread(by="category", dir="theta")) \
    .mark(rect(thetaSize=0.4, rSize="value", emX=True, emY=True))
```

## Usage

Pass the coordinate transform to [`chart`](/python/api/core/chart) via the
`coord` keyword:

```python
chart(data, coord=polar()) \
    .flow(...) \
    .mark(...) \
    .render(w=400, h=300)
```

`coord` may also be passed as a positional options dict —
`chart(data, {"coord": polar()})` — but the keyword form above is preferred in
Python.

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
