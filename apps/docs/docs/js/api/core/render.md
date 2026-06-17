# render

Renders the chart into a DOM element. To get the SVG out as a string or file
instead, see [export](/js/api/core/export).

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

### Explicit size makes a self-contained scale region

When you give a (sub)chart an explicit `w`/`h` on a dimension, its scale on that
dimension resolves against that pixel box rather than against any larger layout it
is composed into. The axis becomes self-contained: a chart sized this way can be
dropped into a bigger graphic without sharing — or polluting — the surrounding
axes with its own units.

This is what makes composed layouts like a marginal histogram work. The count
histograms are sized to a fixed pixel band (`Chart(data, { h: 80 })` /
`Chart(data, { w: 80 })`) and laid out alongside a center scatter; because each
histogram absorbs its own count scale, only the scatter's data units drive the
shared x/y axes.

## Axes

The `axes` option controls per-axis visibility and titles. It accepts a boolean, a
per-dimension object, or per-dimension title control:

```ts
axes: true                                     // both axes, titles inferred
axes: false                                    // no axes (the default)
axes: { x: true, y: false }                    // x only
axes: { x: { title: "Year" }, y: true }        // custom x title, inferred y title
axes: { x: { title: false }, y: true }         // suppress the inferred x title
```

`axes` is most naturally a `chart()`/`Chart()` option (e.g.
`gf.Chart(data, { axes: true })`); it is also accepted directly on `.render()`, as
the examples below show.

### Axes with inferred titles

When `axes: true` (or `{ title }` is omitted), each axis title is inferred from the
field that dimension encodes — `lake` on x, `count` on y here.

::: gofish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

### Only x-axis visible

::: gofish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: { x: true } });
```

:::

### Custom x-axis title, inferred y-axis title

::: gofish

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

::: gofish

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
