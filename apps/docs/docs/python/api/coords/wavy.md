---
order: 50
---

# wavy

Warps the plane with a sinusoidal ripple, so a straight edge is drawn as a wave.
Used for decorative geometry — a balloon string, a flag, a squiggly connector.

::: gofish example:balloon-chart hidden
:::

```python
from gofish import layer, rect, wavy

layer([rect(w=4, h=120)], coord=wavy(), x=0, y=0).render(w=200, h=200)
```

## Signature

```python
wavy() -> Coord
```

Pass it as the `coord` of a [`layer`](/python/api/operators/layer) (or of a
chart) to warp everything inside that scope.

## Parameters

::: gofish-ref wavy
:::
