# table

Groups data by two fields and lays out groups in a 2D grid — one axis per field. The primary operator for heatmaps and other grid-based visualizations.

::: gofish

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

gf.chart(data, {
  color: gf.gradient(["#ffffcc", "#fd8d3c", "#bd0026"]),
  axes: true,
})
  .flow(gf.table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(gf.rect({ fill: "value" }))
  .render(root, { w: 500, h: 300 });
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
chart(data, { color: gradient(["#ffffcc", "#fd8d3c", "#bd0026"]), axes: true })
  .flow(table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(rect({ fill: "value" }))
  .render(container, { w: 600, h: 400 });

// Asymmetric spacing
.flow(table({ by: { x: "col", y: "row" }, spacing: [2, 8] }))
```

## Notes

- Data insertion order determines column and row ordering. Sort your data first if you need a specific order.
- Unlike nested `spread` calls, `table` correctly exposes ordinal axes on both dimensions so axis labels render on both x and y.
- Pair with `gradient()` on the chart color option and `fill: "fieldName"` on the mark for heatmap coloring.

### Cell sizing

Tracks size by one rule: a column (or row) is as wide (or tall) as its widest
(or tallest) cell — `track = max(cell size claims)`. Cells that carry no size
claim ("fill" cells, like a plain `rect({ fill })` in a heatmap) contribute
nothing, so an **all-fill table divides its box into equal tracks** exactly as
before — heatmaps are unchanged. When cells DO carry a size claim (for example a
nested chart whose own content has an intrinsic size), each track sizes to its
widest cell and the table shrinks to fit its content, rather than stretching
every cell to an equal share of the box.
