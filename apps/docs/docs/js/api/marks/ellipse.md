# ellipse

Draws an ellipse. Unlike `circle`, allows independent control of width and height.

::: starfish

```js
gf.ellipse({ w: 100, h: 60, fill: "mediumseagreen" }).render(root, {
  w: 150,
  h: 100,
});
```

:::

## Signature

```ts
ellipse({ w?, h?, fill?, stroke?, strokeWidth? })
```

## Parameters

| Option        | Type               | Description                                          |
| ------------- | ------------------ | ---------------------------------------------------- |
| `w`           | `number \| string` | Width — number for fixed, field name to encode data  |
| `h`           | `number \| string` | Height — number for fixed, field name to encode data |
| `fill`        | `string`           | Fill color or field name for color encoding          |
| `stroke`      | `string`           | Stroke color (defaults to `fill`)                    |
| `strokeWidth` | `number`           | Stroke width (default `0`)                           |

## Examples

```ts
// Fixed size ellipse
ellipse({ w: 80, h: 40, fill: "coral" });

// Ellipse with stroke
ellipse({ w: 60, h: 30, fill: "white", stroke: "black", strokeWidth: 2 });

// Data-driven dimensions
ellipse({ w: "width", h: "height", fill: "category" });
```

## See Also

- [circle](/js/api/marks/circle) — Equal width and height (circular shape)
- [rect](/js/api/marks/rect) — Rectangular shape
