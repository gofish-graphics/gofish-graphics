---
order: 5
---

# Coord.linear

The identity coordinate transform: Cartesian x and y, unchanged. This is what a
chart uses when you pass no `coord`, so you only name it explicitly to override
an enclosing coordinate space back to Cartesian.

```python
from gofish import chart, spread, rect, Coord

chart(seafood, coord=Coord.linear(), axes=True) \
    .flow(spread(by="lake", dir="x")) \
    .mark(rect(h="count")) \
    .render(w=400, h=250)
```

## Signature

```python
Coord.linear() -> Coord
```

## Parameters

::: gofish-ref linear
:::

## See Also

- [Coord.polar](/python/api/coords/polar) — angle and radius instead of x and y
