# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: gofish

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

| Parameter       | Type                  | Description                                                                                                                                                                  |
| --------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`          | `T`                   | The dataset to visualize                                                                                                                                                     |
| `options.w`     | `number`              | Width hint for the chart frame                                                                                                                                               |
| `options.h`     | `number`              | Height hint for the chart frame                                                                                                                                              |
| `options.coord` | `CoordinateTransform` | Coordinate transform (e.g. `polar()`)                                                                                                                                        |
| `options.color` | `ColorConfig`         | Color scale applied to all marks in this chart. Use [`palette()`](/js/api/color/palette) for categorical data or [`gradient()`](/js/api/color/gradient) for continuous data. |
| `options.axes`  | `AxesOptions`         | Auto-generate axes, labels, and legends. See [Axes](#axes) below.                                                                                                            |

Returns a `ChartBuilder<T>` with [`.flow()`](/js/api/core/flow), [`.mark()`](/js/api/core/mark), [`.render()`](/js/api/core/render), and [`.zOrder()`](#zorder) methods.

## Axes

`axes` accepts a boolean, a per-dimension object, or per-dimension title control:

```ts
chart(data, { axes: true }); // both axes, titles inferred
chart(data, { axes: false }); // no axes (the default)
chart(data, { axes: { x: true, y: false } }); // x only
chart(data, { axes: { x: { title: "Year" }, y: true } }); // custom x title, inferred y title
chart(data, { axes: { x: { title: false }, y: true } }); // suppress the inferred x title
```

The full type is:

```ts
type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
type AxisOptions = boolean | { title?: string | false };
```

Each axis title defaults to the field that dimension encodes (e.g. `count` for
`rect({ h: "count" })`). Pass `{ title: "…" }` to override it, or `{ title: false }`
to show the axis with no title. Manual `axis: true/false` overrides on individual
operators within the chart are still respected when `axes: true`. See
[render › Axes](/js/api/core/render#axes) for live examples.

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
