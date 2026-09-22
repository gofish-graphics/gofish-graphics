---
order: 20
---

# circle

Draws a circle for each data item. A convenience wrapper around `ellipse` with equal width and height.

::: gofish

```js
gf.chart([{ size: 40 }])
  .mark(gf.circle({ r: 40, fill: "coral" }))
  .render(root, { w: 150, h: 150 });
```

:::

## Signature

```ts
circle({ r?, fill?, stroke?, strokeWidth?, opacity?, debug? })
```

## Parameters

::: gofish-ref circle
:::

## Examples

```ts
// Fixed size circle
.mark(circle({ r: 10, fill: "steelblue" }))

// Circle with stroke
.mark(circle({ r: 15, fill: "white", stroke: "black", strokeWidth: 2 }))

// Named for use with selectAll()
.mark(circle({ r: 8 }).name("points"))

// Per-datum opacity: fade everything but the current day
.mark(circle({ r: 3, fill: "species", opacity: (d) => (d.day === day() ? 1 : 0.1) }))
```
