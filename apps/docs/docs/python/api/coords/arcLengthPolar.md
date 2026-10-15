---
order: 30
---

# Coord.arc_length_polar

A polar-like transform parameterized by arc length instead of angle, so equal
steps along the x-axis cover equal distance along the curve rather than equal
angle. Use it when a radial layout should keep a constant pitch as the radius
grows.

```python
from gofish import chart, stack, rect, Coord

chart(seafood, coord=Coord.arc_length_polar()) \
    .flow(stack(by="species", dir="x")) \
    .mark(rect(w="count", fill="species")) \
    .render(w=400, h=300)
```

## Signature

```python
Coord.arc_length_polar() -> Coord
```

## Parameters

::: gofish-ref arcLengthPolar
:::

## See Also

- [polar](/python/api/coords/polar) — the angle-parameterized transform
