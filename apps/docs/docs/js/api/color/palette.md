# palette

```ts
palette(values);
```

Creates a categorical color scale. Pass it to `chart(data, { color })` or
`.render(el, { color })`.

| `values` type            | Behavior                         |
| ------------------------ | -------------------------------- |
| `string`                 | Named scheme: `"tableau10"`      |
| `string[]`               | Colors cycled by index           |
| `Record<string, string>` | Explicit field value → color map |

```ts
// Named scheme
chart(data, { color: palette("tableau10") })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value", fill: "category" }))
  .render(container, { w: 500, h: 300 });

// Explicit array
chart(data, { color: palette(["#e15759", "#4e79a7", "#59a14f"]) });

// Key → color map
chart(data, { color: palette({ low: "#4e79a7", high: "#e15759" }) });
```

See also [`gradient`](/js/api/color/gradient) for continuous data.
