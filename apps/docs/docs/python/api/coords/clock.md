# clock

A polar coordinate system oriented like a clock face. 0° is at 12 o'clock (top) and angles increase clockwise. Ideal for pie charts, donut charts, and radial visualizations.

::: gofish example:pie-chart hidden
:::

```python
from gofish import chart, stack, rect, clock

chart(seafood, coord=clock()) \
    .flow(stack(by="species", dir="x")) \
    .mark(rect(w="count", fill="species")) \
    .render(w=400, h=300)
```

## Signature

```python
clock() -> Coord
```

## Parameters

None. The clock transform has no configuration options.

## Usage

Pass the coordinate transform to [`chart`](/python/api/core/chart) via the
`coord` keyword:

```python
chart(data, coord=clock()) \
    .flow(...) \
    .mark(...) \
    .render(w=400, h=300)
```

`coord` may also be passed as a positional options dict —
`chart(data, {"coord": clock()})` — but the keyword form above is preferred in
Python.

## Coordinate Mapping

| Cartesian | Clock                               |
| --------- | ----------------------------------- |
| x         | angle (theta), 0° at top, clockwise |
| y         | radius from center                  |

## Examples

```python
import math

# Pie chart
chart(data, coord=clock()) \
    .flow(stack(by="category", dir="x")) \
    .mark(rect(w="value", fill="category"))

# Donut chart (with inner radius)
chart(data, coord=clock()) \
    .flow(stack(by="category", dir="x", y=50, h=50)) \
    .mark(rect(w="value", fill="category"))

# Rose chart (radial bar chart)
chart(data, coord=clock()) \
    .flow(stack(by="month", dir="x")) \
    .mark(rect(w=(math.pi * 2) / 12, emX=True, h="value"))
```

## See Also

- [polar](/python/api/coords/polar) — Standard polar coordinates with 0° at right
