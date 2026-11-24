---
order: 20
---

# Coord.clock

A polar coordinate system oriented like a clock face. 0° is at 12 o'clock (top) and angles increase clockwise. Ideal for pie charts, donut charts, and radial visualizations.

::: gofish example:pie-chart hidden
:::

```python
from gofish import chart, stack, spread, rect, Coord

chart(seafood, coord=Coord.clock()) \
    .flow(stack(by="species", dir="x")) \
    .mark(rect(w="count", fill="species")) \
    .render(w=400, h=300)
```

## Signature

```python
Coord.clock(
    *,
    inner_radius: float | None = None,
    central_angle: float | None = None,
    center: tuple[float, float] | None = None,
) -> Coord
```

`Coord.clock(**options)` is a preset of
[`Coord.polar()`](/python/api/coords/polar):
`Coord.polar(baseline_angle=math.pi / 2, direction=-1, **options)`. It fixes
`baseline_angle` and `direction`, so the number 0 on the angular axis sits at
12 o'clock and angles increase clockwise. It takes the other options of polar.
Passing `baseline_angle` or `direction` is a `TypeError`. A clock space is a
polar space, and it crosses the wire as
`{"type": "polar", "baselineAngle": ..., "direction": -1, ...}`.

## Parameters

::: gofish-ref Coord.clock
:::

See [polar's Parameters](/python/api/coords/polar#parameters).

## Usage

Pass the coordinate transform to [`chart`](/python/api/core/chart) via the
`coord` keyword:

```python
chart(data, coord=Coord.clock()) \
    .flow(...) \
    .mark(...) \
    .render(w=400, h=300)
```

## Coordinate Mapping

| Cartesian | Clock                               |
| --------- | ----------------------------------- |
| x         | angle (theta), 0° at top, clockwise |
| y         | radius from center                  |

## Examples

```python
import math

# Pie chart
chart(data, coord=Coord.clock()) \
    .flow(stack(by="category", dir="x")) \
    .mark(rect(w="value", fill="category"))

# Donut chart (hollow center via inner radius)
chart(data, coord=Coord.clock(inner_radius=0.6)) \
    .flow(stack(by="category", dir="x")) \
    .mark(rect(w="value", fill="category"))

# Rose chart (radial bar chart)
chart(data, coord=Coord.clock()) \
    .flow(spread(by="month", dir="x", spacing=0)) \
    .mark(rect(h="value"))
```

## See Also

- [polar](/python/api/coords/polar) — The same transform with 0° at right, going counter-clockwise
