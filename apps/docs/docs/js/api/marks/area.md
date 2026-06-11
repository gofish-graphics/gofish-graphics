# area

Fills the area between data points (edge-to-edge). Takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

::: starfish

```js
const lakeTotals = Object.entries(_.groupBy(seafood, "lake")).map(
  ([lake, items]) => ({
    lake,
    count: items.reduce((sum, item) => sum + item.count, 0),
  })
);

gf.Layer([
  gf
    .Chart(lakeTotals)
    .flow(gf.spread({ by: "lake", dir: "x", spacing: 64 }))
    .mark(gf.blank({ h: "count" }).name("points")),
  gf.Chart(gf.selectAll("points")).mark(gf.area({ opacity: 0.6 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
area({ stroke?, strokeWidth = 0, opacity?, mixBlendMode = "normal", dir = "x", interpolation = "bezier" })
```

## Parameters

| Option          | Type                     | Description         |
| --------------- | ------------------------ | ------------------- |
| `stroke`        | `string`                 | Stroke color        |
| `strokeWidth`   | `number`                 | Stroke width        |
| `opacity`       | `number`                 | Opacity (0–1)       |
| `mixBlendMode`  | `"normal" \| "multiply"` | Blend mode          |
| `dir`           | `"x" \| "y"`             | Direction axis      |
| `interpolation` | `"linear" \| "bezier"`   | Curve interpolation |

## Example

```ts
chart(selectAll("bars"))
  .mark(area({ opacity: 0.3 }))
  .render(container, { w: 500, h: 300 });
```
