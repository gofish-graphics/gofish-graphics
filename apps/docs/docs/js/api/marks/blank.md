---
order: 60
---

# blank

Creates invisible positioning guides. Use blank when you need to define positions for other marks (like `line` or `ribbon`) without rendering visible shapes.

A blank is a hidden rect, `rect().hidden()` with blank's own options: it takes part in layout, carries its datum, can be named and selected with `selectAll`, and feeds the color scale, but it produces no SVG element and no hover target. Like any hidden mark it keeps its shape, so as an operand of `intersect`, `cut` or another compositor it gives its box. No option makes a blank paint.

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.layer([
  gf
    .chart(locations)
    .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
    .mark(gf.blank().name("points")),
  gf
    .chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "steelblue", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
blank({ w?, h?, fill?, debug? })
```

## Parameters

::: gofish-ref blank
:::

## Examples

```ts
// Create invisible anchor points for a line chart
.mark(blank().name("points"))

// Blank with height encoding for area charts
.mark(blank({ h: "value" }).name("bars"))

// Log each blank's key and datum to the console (it still draws nothing)
.mark(blank({ debug: true }).name("guides"))
```
