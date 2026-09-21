---
order: 30
---

# arcLengthPolar

A polar-like transform parameterized by arc length instead of angle, so equal
steps along the x-axis cover equal distance along the curve rather than equal
angle. Use it when a radial layout should keep a constant pitch as the radius
grows.

::: gofish

```js
gf.chart(seafood, { coord: gf.arcLengthPolar() })
  .flow(gf.stack({ by: "species", dir: "x" }))
  .mark(gf.rect({ w: "count", fill: "species" }))
  .render(root, {
    w: 400,
    h: 300,
    transform: { x: 200, y: 150 },
  });
```

:::

## Signature

```ts
arcLengthPolar();
```

## Parameters

::: gofish-ref arcLengthPolar
:::

## See Also

- [polar](/js/api/coords/polar) — the angle-parameterized transform
