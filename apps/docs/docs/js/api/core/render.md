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
type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
type AxisOptions = boolean | { title?: string | false };
```

**`AxesOptions` (top level)**

- `true` — both axes visible with inferred titles
- `false` — both axes hidden
- `{ x: AxisOptions }` — configure x-axis; y absent means y hidden
- `{ x: AxisOptions, y: AxisOptions }` — configure both axes

**`AxisOptions` (per axis)**

- `true` — axis visible, title inferred from the field encoding (e.g. `rect({ h: "count" })` infers `"count"`)
- `false` — axis hidden, title irrelevant
- `{ title: "Custom" }` — axis visible with title "Custom"
- `{ title: false }` — axis visible, title suppressed

## Examples

### Inferred titles from encodings

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: true });
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
