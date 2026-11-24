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
  .render(root);
```

:::

## Signature

```ts
// Shape form
polygon({ points, fill?, stroke?, strokeWidth?, opacity = 1 })

// Connector form
polygon({ fill?, stroke?, strokeWidth?, opacity = 1 })
polygon({ fill?, stroke?, strokeWidth?, opacity = 1 }, children)
```

`points` is either a literal ring or a field name. Without `points`, the
polygon is the ring through the marks it is applied to (see
[Through marks](#through-marks)). `points` together with `children` is an
error.

## Parameters

::: gofish-ref polygon
:::

## Coordinates

Points are interpreted in the local coordinate system of whatever places the
polygon — typically a `layer` or a constraint. The polygon's bounding box is
the axis-aligned extent of its points; the parent placement system translates
the whole polygon to position it.

Literal points are in the polygon's own frame. Where that frame's y reads
top-down (a polygon placed by a `layer` or a constraint, outside any data-driven
y), y grows downward like SVG, so a trapezoid whose wide edge sits at the bottom
and narrow edge at the top is written:

```ts
polygon({
  points: [
    [10, 0], // top-left   (inset)
    [width - 10, 0], // top-right  (inset)
    [width, h], // bottom-right (the wider edge)
    [0, h], // bottom-left
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
  coord: Coord.geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
}).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
```

Under a curved coordinate space the edges are adaptively resampled, so an
outline follows the projection rather than joining its vertices with straight
pixels.

## Data-driven fill

`fill` and `stroke` work as they do on [`rect`](./rect). A field name reads
that field off each row and sends it through the chart's color scale. Any other
string is a literal color. When `stroke` is omitted it follows the fill.

```ts
chart(counties, { color: Color.gradient(["#fff5eb", "#7f2704"]) }).mark(
  polygon({ points: "ring", fill: "rate" })
);
```

## Through marks

Without `points`, `polygon` draws the closed ring through the centers of marks
another flow placed, in order, with straight edges, the last back to the
first. It reads them as [`line`](./line) does: over the refs of
[`selectAll()`](/js/api/selection/ref), or over explicit children. After
[`group`](/js/api/operators/group) it draws one ring per group. Over one mark
it draws nothing, and over two it draws the segment there and back.

A polygon outside a coordinate space reads the marks where the space draws
them, so the ring through points in a polar space has straight edges. This is
a radar chart:

```ts
layer({ w: 320, h: 320 }, [
  layer({ coord: Coord.clock() }, [
    chart(scores)
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: "#1d3557" }).name("pts")),
  ]),
  chart(selectAll("pts")).mark(polygon({ fill: "#1d3557", opacity: 0.25 })),
]);
```

Inside the coordinate space, the edges are drawn through the space, as a
line's are, so in a polar space they curve.

## Notes

- The polygon is always closed — the last point connects back to the first
  automatically.
- A polygon has no holes. A ring drawn inside another ring paints over it
  rather than cutting it out.
