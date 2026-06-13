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
polar() -> Coord
```

## Parameters

None. The polar transform has no configuration options.

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
```

## See Also

- [clock](/python/api/coords/clock) — Similar to polar but with 0° at 12 o'clock
