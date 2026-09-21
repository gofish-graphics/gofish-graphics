---
order: 50
---

# wavy

Warps the plane with a sinusoidal ripple, so a straight edge is drawn as a wave.
Used for decorative geometry — a balloon string, a flag, a squiggly connector.

::: gofish example:balloon-chart
:::

## Signature

```ts
wavy();
```

Pass it as the `coord` of a [`layer`](/js/api/operators/layer) (or of a chart) to
warp everything inside that scope:

```ts
layer({ coord: wavy(), x: 0, y: 0 }, [rect({ w: 4, h: 120 })]);
```

## Parameters

::: gofish-ref wavy
:::
