---
order: 40
---

# bipolar

Bipolar coordinates: the plane described by two foci rather than one center.
Positions bend around both poles, which suits paired or two-source geometry.

::: gofish

```js
gf.chart(seafood, { coord: gf.bipolar(120) })
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
bipolar(fociDistance?: number);
```

`fociDistance` is positional, not an options object — unlike
[`polar()`](/js/api/coords/polar), which takes an options bag.

## Parameters

::: gofish-ref bipolar
:::
