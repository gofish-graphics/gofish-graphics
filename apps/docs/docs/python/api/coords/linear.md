---
order: 5
---

# linear

The identity coordinate transform: Cartesian x and y, unchanged. It is what a
chart uses when you pass no `coord`, so you only name it explicitly to override
an enclosing coordinate space back to Cartesian.

::: warning Not in the Python API yet
The Python wrapper exposes `polar()`, `clock()`, and `wavy()`; `linear()` has no
Python factory, so a Python chart gets Cartesian coordinates by leaving `coord`
off. See the [JavaScript page](/js/api/coords/linear) for the explicit spelling.
:::

## Parameters

::: gofish-ref linear
:::
