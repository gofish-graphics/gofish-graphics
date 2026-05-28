# table

Groups data by two fields and lays out groups in a 2D grid — one axis per field. The primary operator for heatmaps and other grid-based visualizations.

::: starfish

```js
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = [
  "9am",
  "10am",
  "11am",
  "12pm",
  "1pm",
  "2pm",
  "3pm",
  "4pm",
  "5pm",
];
const data = days.flatMap((day) =>
  hours.map((hour) => ({ day, hour, value: (Math.random() * 100) | 0 }))
);

gf.Chart(data, { color: gf.gradient(["#ffffcc", "#fd8d3c", "#bd0026"]) })
  .flow(gf.table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(gf.rect({ fill: "value" }))
  .render(root, { w: 500, h: 300, axes: true });
```

:::

## Signature

```ts
table({ by: { x, y }, spacing?, numCols? })
```

## Parameters

| Option    | Type                         | Description                                                        |
| --------- | ---------------------------- | ------------------------------------------------------------------ |
| `by`      | `{ x: string; y: string }`   | Two fields whose unique values become columns and rows             |
| `spacing` | `number \| [number, number]` | Gap between cells (single number, or `[xSpacing, ySpacing]` tuple) |
| `numCols` | `number`                     | Override the inferred column count                                 |

## Examples

```ts
// Heatmap: hour on x, day on y, colored by value
Chart(data, { color: gradient(["#ffffcc", "#fd8d3c", "#bd0026"]) })
  .flow(table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(rect({ fill: "value" }))
  .render(container, { w: 600, h: 400, axes: true });

// Asymmetric spacing
.flow(table({ by: { x: "col", y: "row" }, spacing: [2, 8] }))
```

## Notes

- Data insertion order determines column and row ordering. Sort your data first if you need a specific order.
- Unlike nested `spread` calls, `table` correctly exposes ordinal axes on both dimensions so axis labels render on both x and y.
- Pair with `gradient()` on the chart color option and `fill: "fieldName"` on the mark for heatmap coloring.
