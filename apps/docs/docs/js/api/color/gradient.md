# gradient

```ts
gradient(stops);
```

Creates a continuous color scale. Colors are interpolated across the numeric
range of the `fill` field.

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

See also [`palette`](/js/api/color/palette) for categorical data.
