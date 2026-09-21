---
order: 30
---

# ellipse

Draws an ellipse. Unlike `circle`, allows independent control of width and height.

::: gofish

```js
gf.ellipse({ w: 100, h: 60, fill: "mediumseagreen" }).render(root, {
  w: 150,
  h: 100,
});
```

:::

## Signature

```ts
ellipse({ w?, h?, fill?, stroke?, strokeWidth?, opacity = 1 })
```

## Parameters

::: gofish-ref ellipse
:::

## Examples

```ts
// Fixed size ellipse
ellipse({ w: 80, h: 40, fill: "coral" });

// Ellipse with stroke
ellipse({ w: 60, h: 30, fill: "white", stroke: "black", strokeWidth: 2 });

// Data-driven dimensions
ellipse({ w: "width", h: "height", fill: "category" });

// Translucent ellipse
ellipse({ w: 80, h: 40, fill: "coral", opacity: 0.5 });
```

## See Also

- [circle](/js/api/marks/circle) — Equal width and height (circular shape)
- [rect](/js/api/marks/rect) — Rectangular shape
