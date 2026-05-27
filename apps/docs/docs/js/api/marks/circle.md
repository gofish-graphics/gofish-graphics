# circle

Draws a circle for each data item. A convenience wrapper around `rect` with equal width/height and full border radius.

::: starfish

```js
gf.Chart([{ size: 40 }])
  .mark(gf.circle({ r: 40, fill: "coral" }))
  .render(root, { w: 150, h: 150 });
```

:::

## Signature

```ts
circle({ r?, fill?, stroke?, strokeWidth?, debug? })
```

## Parameters

| Option        | Type      | Description                                 |
| ------------- | --------- | ------------------------------------------- |
| `r`           | `number`  | Radius of the circle                        |
| `fill`        | `string`  | Fill color or field name for color encoding |
| `stroke`      | `string`  | Stroke color                                |
| `strokeWidth` | `number`  | Stroke width (default `0`)                  |
| `debug`       | `boolean` | Log debug info to console                   |

## Examples

```ts
// Fixed size circle
.mark(circle({ r: 10, fill: "steelblue" }))

// Circle with stroke
.mark(circle({ r: 15, fill: "white", stroke: "black", strokeWidth: 2 }))

// Named for use with select()
.mark(circle({ r: 8 }).name("points"))
```
