# table

Groups data by two fields and lays the groups out in a 2D grid — one axis per
field. The primary operator for heatmaps and other grid-based visualizations.

::: gofish hidden

```ts
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = ["9am", "10am", "11am", "12pm", "1pm"];
const data = days.flatMap((day, di) =>
  hours.map((hour, hi) => ({
    day,
    hour,
    value: ((di * 7 + hi * 13 + 11) * 17) % 100,
  }))
);

gf.chart(data, { color: gf.gradient(["#ffffcc", "#fd8d3c", "#bd0026"]) })
  .flow(gf.table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(gf.rect({ fill: "value" }))
  .render(root, { w: 500, h: 300, axes: true });
```

:::

```python
from gofish import chart, table, rect, gradient

chart(data, color=gradient(["#ffffcc", "#fd8d3c", "#bd0026"]), axes=True).flow(
    table(by={"x": "hour", "y": "day"}, spacing=4)
).mark(rect(fill="value")).render(w=500, h=300)
```

## Signature

```python
table(*, by, **options) -> Operator
```

## Parameters

| Parameter | Type                       | Description                                                     |
| --------- | -------------------------- | --------------------------------------------------------------- |
| `by`      | `dict`                     | A dict with `x` and `y` keys naming the two fields              |
| `spacing` | `int` \| `tuple[int, int]` | Gap between cells — a single number or `(x_spacing, y_spacing)` |
| `numCols` | `int`                      | Override the inferred column count                              |

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## Examples

```python
# Heatmap: hour on x, day on y, colored by value
chart(data, color=gradient(["#ffffcc", "#fd8d3c", "#bd0026"])).flow(
    table(by={"x": "hour", "y": "day"}, spacing=4)
).mark(rect(fill="value"))

# Asymmetric spacing
chart(data).flow(table(by={"x": "col", "y": "row"}, spacing=(2, 8)))
```

## Notes

- Data insertion order determines column and row ordering. Sort your data first
  if you need a specific order.
- Unlike nested [`spread`](/python/api/operators/spread) calls, `table` exposes
  ordinal axes on **both** dimensions, so axis labels render on x and y.
- Pair `gradient()` on the chart `color` option with `fill="fieldName"` on the
  mark for heatmap coloring.

### Cell sizing

Tracks size by one rule: a column (or row) is as wide (or tall) as its widest
(or tallest) cell — `track = max(cell size claims)`. Cells that carry no size
claim ("fill" cells, like a plain `rect(fill=...)` in a heatmap) contribute
nothing, so an **all-fill table divides its box into equal tracks** exactly as
before — heatmaps are unchanged. When cells DO carry a size claim (for example a
nested chart with intrinsic content size), each track sizes to its widest cell
and the table shrinks to fit its content instead of stretching every cell to an
equal share of the box.
