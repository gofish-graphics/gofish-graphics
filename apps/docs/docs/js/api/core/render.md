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
| `options.w`    | `number?`     | Width in pixels. Optional — see [Inferred size](#inferred-size).  |
| `options.h`    | `number?`     | Height in pixels. Optional — see [Inferred size](#inferred-size). |
| `options.axes` | `AxesOptions` | Auto-generate axes, labels, and legends. See [Axes](#axes) below. |

## Inferred size

`w` and `h` are optional. When you omit one, GoFish computes that dimension during
layout, per axis, from what the axis encodes:

- An axis that **scales data into pixels** — a positional axis (e.g. a scatter's
  `x`/`y`), or a data-driven size like bar heights (`rect({ h: "value" })`) — has
  no intrinsic pixel extent, so it falls back to a default canvas size of **400px**.
- An axis with **nothing to scale** — a category axis, or fixed-size marks — keeps
  its marks at their natural size and **shrinks to fit** them.

So a bar chart rendered with no `w` gets default-width bars and a graphic only as
wide as it needs to be, while bar heights still scale to the 400px default if `h`
is also omitted. A bare fixed-size shape (or a `layer` of them) shrinks to its own
bounding box. A supplied `w`/`h` is always used as-is.

```ts
// Width inferred (default-width bars, shrink-to-fit); height = 300.
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { h: 300 });
```

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
