---
order: 35
---

# petal

Draws a petal: a wedge whose sides follow the enclosing coordinate system's
angular and radial axes. It is the polar counterpart of `rect`, used for flower
and rose glyphs where a rectangle's straight sides would look wrong.

::: gofish example:flower-chart
:::

## Signature

```ts
petal({ w?, h?, dims?, fill?, stroke?, strokeWidth? })
```

Use it inside a [`polar()`](/js/api/coords/polar) or [`clock()`](/js/api/coords/clock)
coordinate space, where `w`/`h` read as the angular and radial extents, and
`dims: { theta: ..., r: ... }` names the same two axes by their polar names
(see [Axis names](/js/api/coords/polar#axis-names)).

## Parameters

::: gofish-ref petal
:::
