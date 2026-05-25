# rect

Draws a rectangle for each data item.

::: starfish

```js
gf.Chart([{ value: 80 }])
  .mark(gf.rect({ w: 120, h: "value", fill: "steelblue", rx: 4 }))
  .render(root, { w: 200, h: 150 });
```

:::

## Signature

```ts
rect({ w?, h?, fill?, stroke?, strokeWidth = 0, rx?, ry?, label? })
```

## Parameters

| Option        | Type               | Description                                          |
| ------------- | ------------------ | ---------------------------------------------------- |
| `w`           | `number \| string` | Width — number for fixed, field name to encode data  |
| `h`           | `number \| string` | Height — number for fixed, field name to encode data |
| `fill`        | `string`           | Fill color or field name for color encoding          |
| `stroke`      | `string`           | Stroke color (defaults to `fill`)                    |
| `strokeWidth` | `number`           | Stroke width                                         |
| `rx`          | `number`           | Horizontal border radius                             |
| `ry`          | `number`           | Vertical border radius                               |
| `label`       | `boolean`          | Render field value as text label inside rect         |

## Examples

```ts
// Bar chart: height encodes "value" field
.mark(rect({ h: "value" }))

// Fixed size with rounded corners
.mark(rect({ w: 20, h: 20, rx: 4 }))

// Color encodes "category" field
.mark(rect({ h: "value", fill: "category" }))

// Named for use with select()
.mark(rect({ h: "value" }).name("bars"))
```
