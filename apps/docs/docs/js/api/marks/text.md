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
       fontFamily = "system-ui, sans-serif", rotate = 0,
       debugBoundingBox = false, x?, y?, w?, h? })
```

## Parameters

| Option             | Type               | Description                                                                  |
| ------------------ | ------------------ | ---------------------------------------------------------------------------- |
| `text`             | `string \| number` | The string to render — a constant or a field name to read from data          |
| `fill`             | `string`           | Fill color or field name for color encoding (default `"black"`)              |
| `stroke`           | `string`           | Stroke color                                                                 |
| `strokeWidth`      | `number`           | Stroke width (default `0`)                                                   |
| `fontSize`         | `number`           | Font size in pixels (default `12`)                                           |
| `fontFamily`       | `string`           | Font family (default `"system-ui, sans-serif"`)                              |
| `rotate`           | `number`           | Rotation in degrees about the anchor; `90` reads bottom-to-top for a y-title |
| `debugBoundingBox` | `boolean`          | Draw the text's bounding box (for layout debugging)                          |
| `x`, `y`, `w`, `h` | `number \| string` | Explicit position / size accessors                                           |

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
    .flow(group({ by: "datum.lake" }))
    .mark((d) =>
      spread({ dir: "y", alignment: "middle", spacing: 10 }, [
        d[0],
        text({ text: String(sumBy(d[0].datum, "count")) }),
      ])
    ),
]);

// Rotated y-axis title (reads bottom-to-top)
.mark(text({ text: "count", rotate: 90, fontSize: 13 }))
```
