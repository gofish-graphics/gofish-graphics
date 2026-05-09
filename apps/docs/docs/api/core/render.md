# render

Renders the chart into a DOM element.

## Signature

```ts
.render(container, options)
```

## Parameters

| Parameter   | Type          | Description                    |
| ----------- | ------------- | ------------------------------ |
| `container` | `HTMLElement` | The DOM element to render into |
| `options.w` | `number`      | Width in pixels                |
| `options.h` | `number`      | Height in pixels               |

## Example

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
