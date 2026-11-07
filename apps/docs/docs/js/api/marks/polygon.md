---
order: 70
---

# polygon

Draws a closed polygon. Its outline is `points` or `d`. `points` is either a
literal ring of local coordinates, for non-rectangular glyphs (trapezoids,
arrows, custom shapes) that the standard shape primitives can't express, or the
name of a field holding one ring per data row, which is how a map's outlines
are drawn. `d` is SVG path data, for an outline with curves, drawn in a box that
lays out like a rect's, such as a petal in its slot of a polar stack. `points`
are coordinates in the frame; `d` is a shape drawn in its own box.

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
polygon({ points?, d?, w?, h?, fill?, stroke?, strokeWidth?, opacity = 1 })
```

Pass exactly one of `points` and `d`. `points` is either a literal ring or a
field name. `w` and `h` size the box `d` is drawn in, and `points` take
neither.

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

## Path outlines

`d` is SVG path data: one ring of absolute `M`, `L`, `Q`, `C` and `Z` commands.
The outline closes back to its first point, with or without `Z`. Relative
(lowercase) commands, the other SVG commands and a second `M` are errors.

`d` is always in the unit box, 0 to 1 on each axis, and is stretched to a `w` by
`h` box. Each side is sized the way a rect sizes its own: `w` and `h` take a
number (pixels), a field name or an accessor, and a side left out fills the
space the parent gives, or is 16 px when the parent gives none. So
`polygon({ d })` fills its slot. For now (#1038), the unit box's y runs the way
the polygon's frame does: top-down on a plain canvas, and outward from the
center in a polar slot.

```ts
polygon({ w: 40, h: 30, d: "M0 0 L1 0 Q1 1 .5 1 Q0 1 0 0 Z", fill: "teal" });
```

Under a polar or other curved coordinate space, every point of the outline goes
through the space, curves included, the same as a `line`. So a box outline in a
polar slot is a pie slice, and a petal is a polygon whose outline its slot
bends:

::: gofish story:shapes-polygon-marks--petal-wide-slot
:::

```ts
const PETAL = "M0 0 L0 .468 Q.451 .809 .5 1 Q.549 .809 1 .468 L1 0 Z";

chart(
  seafood.filter((d) => d.lake === "Lake F"),
  { coord: Coord.polar(), axes: false }
)
  .flow(stack({ by: "species", dir: "x", h: 90 }))
  .mark(polygon({ w: "count", d: PETAL, fill: "species" }));
```

Under a donut (`innerRadius`), the slot starts at the hole, and so does the
outline.

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

## Notes

- The polygon is always closed — the last point connects back to the first
  automatically.
- A polygon has no holes. A ring drawn inside another ring paints over it
  rather than cutting it out.
