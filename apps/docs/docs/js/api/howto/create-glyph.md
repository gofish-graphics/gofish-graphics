# How to create a glyph

A **glyph** is a composite visual element built from multiple shapes. Instead of using a single mark like `rect()` or `circle()`, you can layer shapes together to create custom visualizations.

## Basic pattern

Use `Layer()` to compose multiple shapes at the same position:

```ts
Layer([shape1, shape2, shape3]);
```

All children are placed at position `(0, 0)` relative to the layer. The layer's size is computed as the union of all children's bounding boxes.

## Creating a simple glyph

Here's a simple "badge" glyph with a rounded rectangle and a dot:

::: starfish

```js
gf.Layer([
  gf.rect({ cx: 0, cy: 0, w: 50, h: 30, rx: 8, fill: "steelblue" }),
  gf.ellipse({ cx: -15, cy: 0, w: 10, h: 10, fill: "white" }),
]).render(root, { w: 100, h: 100 });
```

:::

The shapes are rendered in order, so later shapes appear on top of earlier ones.

## Making glyphs reusable

Wrap your glyph in a function to make it reusable with different parameters:

```ts
const Badge = ({ w = 50, h = 30, fill = "steelblue" }) =>
  Layer([
    rect({ cx: 0, cy: 0, w, h, rx: 8, fill }),
    ellipse({ cx: -w / 2 + 10, cy: 0, w: 10, h: 10, fill: "white" }),
  ]);
```

Now you can create badges of different sizes and colors:

::: starfish

```js
const Badge = ({ w = 50, h = 30, fill = "steelblue" }) =>
  gf.Layer([
    gf.rect({ cx: 0, cy: 0, w, h, rx: 8, fill }),
    gf.ellipse({ cx: -w / 2 + 10, cy: 0, w: 10, h: 10, fill: "white" }),
  ]);

gf.Spread({ dir: "x", spacing: 20 }, [
  Badge({ w: 40, h: 24, fill: "steelblue" }),
  Badge({ w: 60, h: 36, fill: "coral" }),
  Badge({ w: 50, h: 30, fill: "seagreen" }),
]).render(root, { w: 250, h: 100 });
```

:::

## Using glyphs as chart marks

Pass a function to `.mark()` that returns your glyph. The function receives the data for each item:

::: starfish

```js
const Pin = ({ fill = "tomato" }) =>
  gf.Layer([
    gf.ellipse({ cx: 0, cy: -8, w: 16, h: 16, fill }),
    gf.ellipse({ cx: 0, cy: -10, w: 6, h: 6, fill: "white" }),
    gf.rect({ cx: 0, cy: 0, w: 3, h: 10, fill }),
  ]);

const locations = [
  { id: "A", x: 50, y: 150, color: "tomato" },
  { id: "B", x: 150, y: 80, color: "steelblue" },
  { id: "C", x: 280, y: 120, color: "seagreen" },
];

gf.Chart(locations)
  .flow(gf.scatter({ by: "id", x: "x", y: "y" }))
  .mark((d) => Pin({ fill: d[0].color }))
  .render(root, { w: 350, h: 200 });
```

:::

The mark function receives grouped data (an array), so `d[0]` accesses the first item in each group.

## Building complex glyphs

You can combine any shapes: rectangles, ellipses, text, and more. Here's a labeled data point glyph:

::: starfish

```js
const DataPoint = ({ value, fill = "steelblue" }) =>
  gf.Spread({ dir: "y", spacing: 4, alignment: "middle" }, [
    gf.ellipse({ cx: 0, cy: 0, w: 12, h: 12, fill }),
    gf.text({ text: String(value), fontSize: 10 }),
  ]);

const points = [
  { id: 1, x: 50, y: 40, value: 42 },
  { id: 2, x: 150, y: 120, value: 87 },
  { id: 3, x: 250, y: 80, value: 63 },
];

gf.Chart(points)
  .flow(gf.scatter({ by: "id", x: "x", y: "y" }))
  .mark((d) => DataPoint({ value: d[0].value }))
  .render(root, { w: 350, h: 200 });
```

:::

## Summary

| Task              | Approach                           |
| ----------------- | ---------------------------------- |
| Compose shapes    | `Layer([shape1, shape2, ...])`     |
| Make reusable     | Wrap in a function with parameters |
| Use in chart      | Pass glyph function to `.mark()`   |
| Position elements | Use `Spread` within the glyph      |
