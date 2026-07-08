# gradient

```ts
gradient(stops);
```

Creates a continuous color scale. Colors are interpolated across the numeric
range of the `fill` field. The legend for a gradient renders as a **continuous
colorbar** (a gradient bar with tick labels), not per-value swatches — so a
heatmap with many distinct values still gets one compact legend.

| `stops` type | Behavior                                       |
| ------------ | ---------------------------------------------- |
| `string`     | Named scheme: `"viridis"`, `"blues"`, `"reds"` |
| `string[]`   | Custom color stops interpolated in LAB space   |

```ts
// Named scheme
chart(data, { color: gradient("viridis") })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value", fill: "temperature" }))
  .render(container, { w: 500, h: 300 });

// Custom stops
chart(data, { color: gradient(["#f7fbff", "#08306b"]) });
```

**Built-in schemes:** `"viridis"`, `"blues"`, `"reds"`

See also [`palette`](/js/api/color/palette) for categorical data, and
[`assignGradientColor`](/js/api/color/assign-gradient-color) to precompute a
color from a gradient outside of a chart's `fill` channel.
