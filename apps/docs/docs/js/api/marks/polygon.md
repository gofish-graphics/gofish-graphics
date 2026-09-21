---
order: 70
---

# polygon

Draws a closed polygon. Its `points` are either literal local coordinates — for
non-rectangular glyphs (trapezoids, arrows, custom shapes) that the standard
shape primitives can't express — or the name of a field holding one ring per
data row, which is how a map's outlines are drawn.

::: gofish

```js
gf.chart([{}])
  .mark(
    gf.polygon({
      points: [
        [0, 0],
        [60, 0],
        [50, 40],
        [10, 40],
      ],
      fill: "steelblue",
    })
  )
  .render(root, { w: 100, h: 60 });
```

:::

## Signature

```ts
polygon({ points, fill?, stroke?, strokeWidth?, opacity = 1 })
```

`points` is either a literal ring or a field name.

## Parameters

::: gofish-ref polygon
:::

## Coordinates

Points are interpreted in the local coordinate system of whatever places the
polygon — typically a `Layer` or a constraint. The polygon's bounding box is
the axis-aligned extent of its points; the parent placement system translates
the whole polygon to position it.

GoFish is y-up internally, so a trapezoid whose wide edge sits at the bottom
and narrow edge at the top is written:

```ts
polygon({
  points: [
    [0, 0], // bottom-left (the wider edge)
    [width, 0], // bottom-right
    [width - 10, h], // top-right  (inset)
    [10, h], // top-left   (inset)
  ],
});
```

## Examples

```ts
// Trapezoidal weight glyph (from the pulley diagram)
polygon({
  points: [
    [0, 0],
    [width, 0],
    [width - 10, height],
    [10, height],
  ],
  fill: "#545454",
}).name("body");

// Triangle with stroke
polygon({
  points: [
    [0, 0],
    [40, 0],
    [20, 30],
  ],
  fill: "transparent",
  stroke: "black",
  strokeWidth: 2,
});
```

## Field-bound points

When `points` is a string, it names a field on each row of the mark's data, and
the mark draws one polygon per row. The vertices are then **data positions**,
not local pixels: they go through the chart's position scales, and each polygon
places itself where its own coordinates put it.

That is how a basemap is drawn — one row per country ring, each ring a list of
`[longitude, latitude]` pairs, under a [`geo`](../coords/geo) coordinate space:

```ts
chart(world110m, {
  coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
}).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
```

Under a curved coordinate space the edges are adaptively resampled, so an
outline follows the projection rather than joining its vertices with straight
pixels.

## Notes

- The polygon is always closed — the last point connects back to the first
  automatically.
- A polygon has no holes. A ring drawn inside another ring paints over it
  rather than cutting it out.
