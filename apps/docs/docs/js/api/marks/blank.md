# blank

Creates invisible positioning guides. Use blank when you need to define positions for other marks (like `line` or `area`) without rendering visible shapes.

::: starfish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.Layer([
  gf
    .Chart(locations)
    .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
    .mark(gf.blank().name("points")),
  gf
    .Chart(gf.select("points"))
    .mark(gf.line({ stroke: "steelblue", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
blank({ w?, h?, fill?, stroke?, strokeWidth?, rx?, ry?, debug? })
```

## Parameters

| Option        | Type               | Description                                                        |
| ------------- | ------------------ | ------------------------------------------------------------------ |
| `w`           | `number \| string` | Width — number for fixed, field name to encode data (default `0`)  |
| `h`           | `number \| string` | Height — number for fixed, field name to encode data (default `0`) |
| `fill`        | `string`           | Fill color (invisible by default)                                  |
| `stroke`      | `string`           | Stroke color                                                       |
| `strokeWidth` | `number`           | Stroke width                                                       |
| `rx`          | `number`           | Horizontal border radius                                           |
| `ry`          | `number`           | Vertical border radius                                             |
| `debug`       | `boolean`          | When true, renders visibly for debugging                           |

## Examples

```ts
// Create invisible anchor points for a line chart
.mark(blank().name("points"))

// Blank with height encoding for area charts
.mark(blank({ h: "value" }).name("bars"))

// Debug mode to see blank positions
.mark(blank({ debug: true }).name("guides"))
```
