---
order: 20
---

# circle

Draws a circle for each data item. It is an `ellipse` locked to a 1:1 aspect ratio, and it takes the same box dimensions.

The diameter is set by at most one of `r`, `w`, or `h`. Each is a size channel: a number is pixels, and a field name, `field(...)`, or accessor is data.

- `r` is the radius, so the diameter is `2r` for every kind of value. A data `r` sizes both axes.
- `w` or `h` is the diameter along that axis. A data `w` or `h` sizes only that axis, and the other axis follows it in pixels.

With none of them, the circle fills the space it is given. Passing more than one is an error.

::: gofish

```js
gf.chart([{ size: 40 }])
  .mark(gf.circle({ r: 40, fill: "coral" }))
  .render(root, { w: 150, h: 150 });
```

:::

## Signature

```ts
circle({ r?, w?, h?, x?, cx?, x2?, y?, cy?, y2?, emX?, emY?, dims?,
         fill?, stroke?, strokeWidth?, opacity?, fillOpacity?, debug? })
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

// Bubble chart: the radius encodes a field
.mark(circle({ r: "population", fill: "region" }))

// Radius from an accessor
.mark(circle({ r: (d) => (d.highlight ? 6 : 3) }))

// Diameter read against the y axis
.mark(circle({ h: "value" }))

// Named for use with selectAll()
.mark(circle({ r: 8 }).name("points"))

// Per-datum opacity: fade everything but the current day
.mark(circle({ r: 3, fill: "species", opacity: (d) => (d.day === day() ? 1 : 0.1) }))
```
