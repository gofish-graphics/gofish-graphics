# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: starfish

```js
gf.Chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
chart(data, options?)
```

## Parameters

| Parameter       | Type                                    | Description                                                                                                                                                                  |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`          | `T`                                     | The dataset to visualize                                                                                                                                                     |
| `options.w`     | `number`                                | Width hint for the chart frame                                                                                                                                               |
| `options.h`     | `number`                                | Height hint for the chart frame                                                                                                                                              |
| `options.coord` | `CoordinateTransform`                   | Coordinate transform (e.g. `polar()`)                                                                                                                                        |
| `options.color` | `ColorConfig`                           | Color scale applied to all marks in this chart. Use [`palette()`](/js/api/color/palette) for categorical data or [`gradient()`](/js/api/color/gradient) for continuous data. |
| `options.axes`  | `boolean \| { x: boolean; y: boolean }` | Auto-generate axes, labels, and legends. Use an object to toggle x/y axes individually.                                                                                      |

Returns a `ChartBuilder<T>` with [`.flow()`](/js/api/core/flow), [`.mark()`](/js/api/core/mark), [`.render()`](/js/api/core/render), and [`.zOrder()`](#zorder) methods.

## Example

```ts
chart(data, { axes: true })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { w: 500, h: 300 });
```

## .zOrder()

Controls the rendering order of this chart when it is a child of a [`layer`](/js/api/operators/layer). Lower values are drawn first (underneath); higher values are drawn on top.

```ts
chartBuilder.zOrder(value: number): ChartBuilder
```

Children with the same z-order keep their original array order. The default z-order is `0`.

```ts
Layer([
  chart(data)
    .flow(scatter({ by: "x", y: "y" }))
    .mark(line())
    .zOrder(0),
  chart(data)
    .flow(scatter({ by: "x", y: "y" }))
    .mark(circle({ r: 5 }))
    .zOrder(1),
]);
// circles are always drawn on top of the line, regardless of array position
```
