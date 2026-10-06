---
order: 80
---

# text

Draws a text label for each data item. Used for value labels on bars, point
annotations, node names in diagrams, and axis titles.

::: gofish

```js
gf.chart([{ label: "GoFish" }])
  .mark(gf.text({ text: "label", fontSize: 28, fill: "steelblue" }))
  .render(root, { w: 240, h: 80 });
```

:::

## Signature

```ts
text({ text, fill = "black", stroke?, strokeWidth = 0, fontSize = 12,
       fontFamily = "system-ui, sans-serif", fontStyle?, fontWeight?, rotate = 0,
       textAnchor = "start", debugBoundingBox = false, x?, y?, w?, h? })
```

## Parameters

::: gofish-ref text
:::

## Placement

A text is a box, and it is placed exactly as a rect of the same size would be.
`y` is the box's start edge: its top where y reads top-down (a free diagram, an
ordinal spread) and its bottom where y grows upward (a chart with a value axis).
`cy` is the box's center. Spreads, stacks, layers and `align`/`distribute`
constraints place it by its box, as they place a rect. In x, `x` is the
`textAnchor` point: the left edge for the default `"start"` (as for a rect), the
center for `"middle"`, the right edge for `"end"`.

`rotate` turns the glyphs about the point on their baseline at `textAnchor`; the
box is then the rotated glyphs' footprint.

## Examples

```ts
// Static label
.mark(text({ text: "Hello", fontSize: 24, fill: "steelblue" }))

// Text content read from a data field
.mark(text({ text: "name" }))

// Value labels: layer text totals on top of bars
layer([
  chart(seafood)
    .flow(spread({ by: "lake", dir: "x" }))
    .mark(rect({ h: "count" }).name("bars")),
  chart(selectAll("bars"))
    .flow(group({ by: "lake" }))
    .mark((d) =>
      // A spread on y reads top-down: the total above its bar.
      spread({ dir: "y", alignment: "middle", spacing: 10 }, [
        text({ text: String(sumBy(d[0].datum, "count")) }),
        d[0],
      ])
    ),
]);

// Rotated y-axis title (reads bottom-to-top): rotate is clockwise on screen
.mark(text({ text: "count", rotate: -90, fontSize: 13 }))

// Italic label
.mark(text({ text: "note", fontStyle: "italic" }))

// Light-weight label
.mark(text({ text: "caption", fontWeight: 300 }))
```
