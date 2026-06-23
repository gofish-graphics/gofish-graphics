# polygon

Draws a closed polygon from explicit local-coordinate points. Useful for
non-rectangular glyphs (trapezoids, arrows, custom shapes) that can't be
expressed by the standard shape primitives.

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
polygon({ points, fill?, stroke?, strokeWidth?, name? })
```

## Parameters

| Option        | Type                 | Default   | Description                                                                |
| ------------- | -------------------- | --------- | -------------------------------------------------------------------------- |
| `points`      | `[number, number][]` | —         | Vertices in local coordinates. GoFish is y-up: `[0, 0]` is the bottom-left |
| `fill`        | `string`             | `"black"` | Fill color                                                                 |
| `stroke`      | `string`             | `fill`    | Stroke color (defaults to `fill`)                                          |
| `strokeWidth` | `number`             | `0`       | Stroke width                                                               |
| `name`        | `string`             | —         | Name for use with `ref` / `selectAll` / `.constrain()`                     |

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

## Notes

- The polygon is always closed — the last point connects back to the first
  automatically.
- Points are literals, not channel-bound. If you need a polygon whose shape
  depends on data, compose multiple polygons or use a derived mark
  (`createMark`).
