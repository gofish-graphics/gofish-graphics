---
order: 5
---

# Coord.linear

The identity coordinate transform: Cartesian x and y, unchanged. This is what a
chart uses when you pass no `coord`, so you only name it explicitly to override
an enclosing coordinate space back to Cartesian.

::: gofish

```js
gf.chart(seafood, { coord: gf.Coord.linear(), axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
Coord.linear();
```

## Parameters

::: gofish-ref linear
:::

## See Also

- [Coord.polar](/js/api/coords/polar) — angle and radius instead of x and y
