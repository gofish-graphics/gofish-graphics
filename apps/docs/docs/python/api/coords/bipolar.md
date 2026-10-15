---
order: 40
---

# Coord.bipolar

Bipolar coordinates: the plane described by two foci rather than one center.
Positions bend around both poles, which suits paired or two-source geometry.

```python
from gofish import chart, stack, rect, Coord

chart(seafood, coord=Coord.bipolar(120)) \
    .flow(stack(by="species", dir="x")) \
    .mark(rect(w="count", fill="species")) \
    .render(w=400, h=300)
```

## Signature

```python
Coord.bipolar(foci_distance: float | None = None) -> Coord
```

`foci_distance` may be passed by position, as in JavaScript
(`Coord.bipolar(120)`), or by keyword (`Coord.bipolar(foci_distance=120)`).

## Parameters

::: gofish-ref bipolar
:::
