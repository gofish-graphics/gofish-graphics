---
order: 35
---

# petal

Draws a petal: a wedge whose sides follow the enclosing coordinate system's
angular and radial axes. It is the polar counterpart of
[`rect`](/python/api/marks/rect), for flower and rose glyphs where a rectangle's
straight sides would look wrong.

::: gofish example:flower-chart hidden
:::

```python
from gofish import chart, stack, petal, polar

chart(seafood, coord=polar()) \
    .flow(stack(by="species", dir="x")) \
    .mark(petal(w="count", fill="species")) \
    .render(w=300, h=300)
```

## Signature

```python
petal(*, x=None, cx=None, x2=None, w=None, emX=None,
      y=None, cy=None, y2=None, h=None, emY=None,
      theta=None, thetaSize=None, r=None, rSize=None,
      fill=None, stroke=None, strokeWidth=None) -> Mark
```

Use it inside a [`polar()`](/python/api/coords/polar) or
[`clock()`](/python/api/coords/clock) coordinate space, where `w`/`h` read as the
angular and radial extents (and `theta`/`thetaSize`/`r`/`rSize` spell the same
thing).

## Parameters

::: gofish-ref petal
:::
