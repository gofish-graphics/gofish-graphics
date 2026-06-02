# render

Renders the chart into a DOM element.

## Signature

```ts
.render(container, options)
```

## Parameters

| Parameter      | Type          | Description                                                       |
| -------------- | ------------- | ----------------------------------------------------------------- |
| `container`    | `HTMLElement` | The DOM element to render into                                    |
| `options.w`    | `number`      | Width in pixels                                                   |
| `options.h`    | `number`      | Height in pixels                                                  |
| `options.axes` | `AxesOptions` | Auto-generate axes, labels, and legends. See [Axes](#axes) below. |

## Axes

The `axes` option controls per-axis visibility and titles:

```ts
chart(data, { axes: true })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { w: 500, h: 300 });
```

```ts
chart(data, { axes: { x: true, y: false } })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { w: 500, h: 300 });
```

:::

### Only x-axis visible

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: { x: true } });
```

:::

### Custom x-axis title, inferred y-axis title

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, {
    w: 400,
    h: 250,
    axes: { x: { title: "Sampling Location" }, y: true },
  });
```

:::

### Suppress the inferred title on the x-axis

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, {
    w: 400,
    h: 250,
    axes: { x: { title: false }, y: true },
  });
```

:::
