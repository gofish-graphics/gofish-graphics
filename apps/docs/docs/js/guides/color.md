# Color

GoFish provides two color scale types: **palettes** for categorical data and **gradients** for continuous data. Pass them as the `color` option to `Chart()`.

## Palette

Use `palette()` for discrete, categorical colors. It cycles through colors by index or maps values by key.

### Input formats

```ts
// Named scheme — cycles through preset colors
Chart(data, { color: palette("tableau10") });

// Array — cycles by index
Chart(data, { color: palette(["#e41a1c", "#377eb8", "#4daf4a"]) });

// Object — maps specific keys to colors (unmapped values fall back to #ccc)
Chart(data, { color: palette({ Salmon: "#e15759", Bass: "#4e79a7" }) });
```

## Gradient

Use `gradient()` for continuous data. Colors are interpolated in LAB color space via chroma-js.

### Two-color gradient

Pass two color stops to interpolate between them. Lower values map to the first color, higher values to the second.

::: starfish

```js
const scores = [
  { label: "A", value: 4 },
  { label: "B", value: 12 },
  { label: "C", value: 28 },
  { label: "D", value: 47 },
  { label: "E", value: 63 },
  { label: "F", value: 81 },
  { label: "G", value: 90 },
  { label: "H", value: 100 },
];

gf.Chart(scores, { color: gf.gradient(["#f7fbff", "#08519c"]) })
  .flow(gf.spread({ by: "label", dir: "x" }))
  .mark(gf.rect({ h: "value", fill: "value" }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

### Three-color diverging gradient

Pass three stops for a diverging scale — low values get the first color, mid values the second, and high values the third.

::: starfish

```js
const scores = [
  { label: "A", value: 4 },
  { label: "B", value: 12 },
  { label: "C", value: 28 },
  { label: "D", value: 47 },
  { label: "E", value: 63 },
  { label: "F", value: 81 },
  { label: "G", value: 90 },
  { label: "H", value: 100 },
];

gf.Chart(scores, { color: gf.gradient(["#f7fbff", "#42c663", "#6b0808"]) })
  .flow(gf.spread({ by: "label", dir: "x" }))
  .mark(gf.rect({ h: "value", fill: "value" }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

### Input formats

```ts
// Named scheme — uses preset stops
Chart(data, { color: gradient("blues") });

// Two stops — interpolates between them in LAB space
Chart(data, { color: gradient(["#f7fbff", "#6b0808"]) });

// Three stops — diverging scale (low → mid → high)
Chart(data, { color: gradient(["#f7fbff", "#42c663", "#6b0808"]) });
```

## Built-in schemes

| Name        | Type     | Description                           |
| ----------- | -------- | ------------------------------------- |
| `tableau10` | palette  | 10 distinct categorical colors        |
| `viridis`   | gradient | Perceptually uniform, colorblind-safe |
| `blues`     | gradient | Single-hue sequential blue            |
| `reds`      | gradient | Single-hue sequential red             |

## How it works

Color assignment is a two-pass process:

1. GoFish collects all unique `fill` values from the chart's data
2. For **palettes**, each unique value is assigned a color by index (arrays) or key (objects). For **gradients**, a position `t = (value - min) / (max - min)` is computed and interpolated across the stops

Literal hex strings in `fill` (e.g. from `derive`) pass through directly — if a value isn't found in the color map, the value itself is used as the color.

## Examples

```ts
// Stacked bar chart with categorical colors
Chart(seafood, { color: palette("tableau10") })
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));

// Heatmap with continuous gradient
Chart(data, { color: gradient(["#f7fbff", "#08519c"]) })
  .flow(table("hour", "day"))
  .mark(rect({ fill: "value" }));

// Explicit key-to-color mapping
Chart(data, { color: palette({ Male: "#ca8861", Female: "#675193" }) })
  .flow(spread({ by: "age", dir: "y" }), stack({ by: "sex", dir: "x" }))
  .mark(rect({ w: "proportion", fill: "sex" }));
```
