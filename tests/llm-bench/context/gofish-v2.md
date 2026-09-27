# GoFish JS: writing static charts

GoFish (`gofish-graphics`) is a JavaScript library for charts and diagrams. It is new, so rely on this page, not on memory. Every name below exists in the current API. Names that are not here (for example `barChart`, `x()`, `encode`, `Spread`, `StackY`, `mark("bar")`) either do not exist or do something else.

Your module has this shape:

```js
import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: "category", dir: "x" }))
    .mark(rect({ h: "value" }))
    .render(container, { w: 500, h: 300 });
}
```

`data` is an array of plain row objects. `.render()` returns a Promise, so `return` it.

## Mental model

A chart is written as `chart(data, options).flow(op1, op2, ...).mark(mark).render(container, { w, h })`.

- `chart(data, options)` takes the rows and chart-wide options: `axes`, `color`, `coord`, `legend`.
- `.flow(...)` is a list of **operators**. Most operators split the rows into groups by a field and lay the groups out. Each operator runs on the groups the one before it made, so `spread({ by: "region" })` followed by `stack({ by: "product" })` gives one stack of products inside each region.
- `.mark(m)` is the shape drawn for each final group (`rect`, `circle`, `line`, `ribbon`, `text`, ...). There is exactly one `.mark()` per chart.
- `.render(container, { w, h })` draws an SVG into `container`.

The operators you need for common charts:

- `spread({ by, dir })` makes one group per distinct value of `by` and places the groups side by side along `dir` (`"x"` or `"y"`) with a gap. It gives a category axis. This is how you make bars.
- `stack({ by, dir })` is like `spread` but with no gap. The sizes add up, so the axis along `dir` is a continuous value axis. Use it for stacked bars, grouped bars (with `dir: "x"`), pie slices, and stacked areas.
- `scatter({ x, y })` places each item at data positions on continuous `x`/`y` axes. With `by`, it makes one item per group instead of one per row.
- `group({ by })` splits rows into groups without laying them out. Use it to make one line per series.
- `table({ by: { x, y } })` makes a grid, one cell per `(x, y)` pair. Use it for heatmaps.
- `derive(fn)` and `filter(pred)` transform the rows. `fn` gets the current array of rows (the whole dataset at the top, or one group's rows after a `spread`) and returns a new array.

**Channels and fields.** A mark option set to a string that names a field in the data is data-driven: `rect({ h: "value" })` sets each bar's height from `value`, and `rect({ fill: "product" })` colors by `product` and adds a legend. A string that is not a field name is a literal: `fill: "steelblue"`. A number is a literal in pixels: `circle({ r: 4 })`. When a group holds many rows, size channels (`w`, `h`, `r`) **sum** the rows and position channels (`x`, `y`) take the **mean**. So you can pass raw rows to a bar chart and get totals without pre-aggregating. To change the aggregation, use `field("value").mean()`, `.sum()`, `.count()`, or `.distinct()`.

**Sizes you leave out are inferred.** In `spread({ by: "category", dir: "x" })` with `rect({ h: "value" })`, the bar width fills the space. Do not set `w` on bars unless you want fixed-width bars.

**Axes and legends.** Pass `axes: true` to `chart()` (or to `.render()`) to get axes with titles taken from the field names. A legend appears on its own whenever `fill` or `stroke` is bound to a field. Without `axes`, no axes are drawn.

**Coordinates.** `chart(data, { coord: clock() })` draws the chart in polar coordinates, starting at 12 o'clock and going clockwise. In polar, `x`/`w` become angle and `y`/`h` become radius. A pie is a `stack` along `x` in `clock()`.

## Reference

### Top level

| Call                                  | Notes                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `chart(data, opts?)`                  | `opts`: `axes`, `color`, `coord`, `legend` (default `true`), `padding` (polar only, px around the circle, default 30).                     |
| `.flow(...ops)`                       | Zero or more operators, applied in order.                                                                                                  |
| `.mark(mark)`                         | One mark.                                                                                                                                  |
| `.layer(chart().flow(...).mark(...))` | Draws a second layer over the marks of the first. `chart()` with no data means "the marks drawn so far". See the line-with-points example. |
| `.render(container, opts)`            | `opts`: `w`, `h` (px, size of the plot area), `axes` (same as on `chart`). Returns a Promise.                                              |

`axes` values:

```js
axes: true                                  // both axes, titles from field names
axes: { x: true, y: false }                 // x only
axes: { x: { title: "Year" }, y: { title: "Sales (USD)" } }
axes: { x: { title: false }, y: true }      // hide one title
axes: { x: { labelAngle: 45 }, y: true }    // rotate crowded x labels (degrees, clockwise)
```

`w` and `h` size the plot area. Axes, titles and the legend are drawn outside it, so the SVG ends up about 100px wider and 95px taller than `w` x `h`, plus about 100px more width for a legend. If the chart must fit a fixed box, pass a smaller `w`/`h`.

### Operators (used inside `.flow()`)

| Operator                           | Key options (default)                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spread({ by, dir })`              | `by`: field name or `field(...)` expression. `dir`: `"x"` or `"y"` (required). `spacing`: gap in px (8). `alignment`: `"start"`, `"middle"`, `"end"`, `"baseline"` (`"baseline"`). `reverse` (false). `axes`: per-operator axis override. |
| `stack({ by, dir })`               | Same options as `spread`, but there is no gap. `size: field("v").normalize()` makes every stack fill 100% (normalized stacked bar).                                                                                                       |
| `scatter({ x, y })`                | `x`, `y`: field names for continuous positions. `by`: one item per group. `xMin`/`xMax` (or `yMin`/`yMax`): make each item span a data range (histogram bins). `axes`: per-operator axis override.                                        |
| `group({ by })`                    | Splits rows by `by` without layout.                                                                                                                                                                                                       |
| `table({ by: { x, y }, spacing })` | A grid of cells keyed by two fields. `spacing` (0): cell gap in px.                                                                                                                                                                       |
| `derive(fn)`                       | `fn(rows) => newRows`. Any JS works in `fn`.                                                                                                                                                                                              |
| `filter(pred)`                     | `pred(row) => boolean`.                                                                                                                                                                                                                   |

`by` can be sorted or binned with `field()`:

```js
spread({ by: field("category").sort("value", "desc"), dir: "x" }); // order groups by the total of "value"
spread({ by: field("category").sort(), dir: "x" }); // order by the key itself
spread({ by: field("month").sort(["Jan", "Feb", "Mar"]), dir: "x" }); // explicit order
spread({ by: field("age").bin({ thresholds: 10 }), dir: "x" }); // bin a number into groups
```

Without a sort, groups keep the order in which their values first appear in the data. With `dir: "y"`, the first group is at the top.

### Marks (used inside `.mark()`)

| Mark            | Options                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rect({...})`   | `w`, `h` (size), `x`, `y` (position), `fill`, `stroke`, `strokeWidth` (0), `opacity` (1), `rx`, `ry` (corner radius). Bars, heatmap cells, pie slices.                                          |
| `circle({...})` | `r` (radius px, or a field for bubble size), `fill`, `stroke`, `strokeWidth`, `opacity`. Has no `x`/`y`: place it with `scatter`.                                                               |
| `line({...})`   | `stroke`, `strokeWidth` (1), `strokeDasharray` (e.g. `"4 2"`), `opacity`, `curve` (smooth by default; `"straight"` for straight segments), `along`. Connects the points of each group in order. |
| `ribbon({...})` | `h` (band height, a field), `fill`, `opacity`, `stroke`, `curve`, `along`. A filled band between consecutive points: area charts.                                                               |
| `text({...})`   | `text`, `fontSize` (12), `fill` ("black"), `fontWeight`.                                                                                                                                        |

Any mark can carry value labels with `.label(accessor, options)`:

```js
rect({ h: "value" }).label("value"); // default position
rect({ h: "value" }).label(field("value").sum(), { position: "outset" }); // above each bar
rect({ h: "value", fill: "k" }).label("value", {
  position: "center",
  fontSize: 10,
});
```

`position` is `"center"`, `"outset"` (above), or `side-edge[-align]` such as `"inset-top"`, `"outset-right"`. Other options: `fontSize`, `color`, `offset`, `rotate`.

### Color

Put a color scale on the chart with `chart(data, { color })`:

```js
color: palette("tableau10"); // the only named categorical scheme
color: palette(["#4e79a7", "#f28e2b", "#e15759"]); // cycled in group order
color: palette({ Tea: "#4e79a7", Coffee: "#9c755f" }); // value -> color; unlisted values are gray
color: gradient("blues"); // numeric fill; also "reds", "viridis"
color: gradient(["#ffffcc", "#fd8d3c", "#bd0026"]); // custom stops
```

Without `color`, a field bound to `fill` or `stroke` gets a default categorical palette. For a numeric fill (heatmaps), pass a `gradient`.

### Coordinates

`clock(opts?)` and `polar(opts?)`: `innerRadius` (0, a fraction of the outer radius, so `0.5` makes a donut), `startAngle`, `centralAngle` (radians). Pass as `chart(data, { coord: clock() })`.

## Examples

Each example is a complete module. Field names are placeholders: use the task's fields.

### Vertical bar chart

```js
import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ category, value }]
  return chart(data, { axes: true })
    .flow(spread({ by: "category", dir: "x" }))
    .mark(rect({ h: "value", fill: "steelblue" }))
    .render(container, { w: 500, h: 300 });
}
```

### Horizontal bar chart, sorted, with value labels

```js
import { chart, spread, rect, field } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: { x: { title: "Units sold" }, y: true } })
    .flow(spread({ by: field("category").sort("value", "desc"), dir: "y" }))
    .mark(rect({ w: "value" }).label("value", { position: "outset-right" }))
    .render(container, { w: 500, h: 300 });
}
```

For a horizontal bar, spread along `y` and bind `w` (not `h`).

### Grouped bar chart

```js
import { chart, spread, stack, rect } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ region, product, value }]
  return chart(data, { axes: true })
    .flow(
      spread({ by: "region", dir: "x", spacing: 16 }),
      stack({ by: "product", dir: "x" })
    )
    .mark(rect({ h: "value", fill: "product" }))
    .render(container, { w: 500, h: 300 });
}
```

### Stacked bar chart

```js
import { chart, spread, stack, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "region", dir: "x" }),
      stack({ by: "product", dir: "y" })
    )
    .mark(rect({ h: "value", fill: "product" }))
    .render(container, { w: 500, h: 300 });
}
```

Horizontal stacked bar: `spread({ by: "region", dir: "y" })`, `stack({ by: "product", dir: "x" })`, `rect({ w: "value", fill: "product" })`.

### Normalized (100%) stacked bar chart

```js
import { chart, spread, stack, rect, field } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "region", dir: "x" }),
      stack({ by: "product", dir: "y", size: field("value").normalize() })
    )
    .mark(rect({ fill: "product" })) // no h: the stack's size sets it
    .render(container, { w: 500, h: 300 });
}
```

### Variable-width bars, Marimekko and mosaic charts

`size` on a `stack` sets each group's extent along `dir` from a field, summed over the group's rows. `size: "tickets"` makes each column's width proportional to its total, and `size: field("tickets").normalize()` turns the totals into shares that fill the space. Nest stacks on alternating `dir` to get a mosaic: the outer stack sets the column widths and the inner stack splits each column. The mark then needs no `w` or `h`. A `spread` with `rect({ w: "tickets" })` does not do this: the columns come out the same width.

```js
import { chart, stack, rect, field } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ team, priority, tickets }]
  return chart(data, { axes: true })
    .flow(
      stack({ by: "team", dir: "x", size: "tickets" }).label("team", {
        position: "outset-top",
      }),
      stack({ by: "priority", dir: "y", size: field("tickets").normalize() })
    )
    .mark(rect({ fill: "priority", stroke: "white", strokeWidth: 1 })) // no w or h
    .render(container, { w: 500, h: 300 });
}
```

`.label("team")` on the outer stack puts one label above each column. For a third level, add `stack({ by: "channel", dir: "x", size: field("tickets").normalize() })` after the second stack, and leave out the `.label()` on the outer stack: it throws on a three-level mosaic.

### Bar of means (aggregation)

```js
import { chart, spread, rect, field } from "gofish-graphics";

export default function render(container, data) {
  // many rows per product; bar = mean of value
  return chart(data, { axes: true })
    .flow(spread({ by: "product", dir: "x" }))
    .mark(rect({ h: field("value").mean() }))
    .render(container, { w: 500, h: 300 });
}
```

### Scatter plot

```js
import { chart, scatter, circle } from "gofish-graphics";

export default function render(container, data) {
  const rows = data.filter((d) => d.x != null && d.y != null);
  return chart(rows, { axes: true })
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 4, fill: "steelblue", opacity: 0.7 }))
    .render(container, { w: 500, h: 300 });
}
```

### Scatter plot colored by category (and bubble size)

```js
import { chart, scatter, circle, palette } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true, color: palette("tableau10") })
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 4, fill: "species" }))
    .render(container, { w: 500, h: 300 });
}
```

For a bubble chart, use `circle({ r: "size", fill: "species", opacity: 0.6 })`.

### Line chart (numeric x)

```js
import { chart, scatter, line } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ year, value }], year is a number
  return chart(data, { axes: true })
    .flow(scatter({ by: "year", x: "year", y: "value" }))
    .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
    .render(container, { w: 500, h: 300 });
}
```

### Multi-line chart

```js
import { chart, group, scatter, line } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ year, series, value }]
  return chart(data, { axes: true })
    .flow(
      group({ by: "series" }),
      scatter({ by: "year", x: "year", y: "value" })
    )
    .mark(line({ stroke: "series", strokeWidth: 2, curve: "straight" }))
    .render(container, { w: 500, h: 300 });
}
```

Lines are smoothed by default. `curve: "straight"` draws straight segments between points.

### Line chart with points

```js
import { chart, group, scatter, circle, line } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(scatter({ x: "year", y: "value" }))
    .mark(circle({ r: 3, fill: "series" }))
    .layer(
      chart()
        .flow(group({ by: "series" }))
        .mark(line({ stroke: "series", curve: "straight" }))
    )
    .render(container, { w: 500, h: 300 });
}
```

### Line chart over categories (month names, date strings)

A continuous `scatter` axis needs numbers. For string x values, spread the categories along x and scatter each series in y. `along` tells the line to run across the months. Set `spacing` so the points span the width.

```js
import { chart, spread, scatter, line } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ month, series, value }], month is a string, rows in time order
  const W = 500;
  const n = new Set(data.map((d) => d.month)).size;
  return chart(data, { axes: true })
    .flow(
      spread({ by: "month", dir: "x", spacing: W / Math.max(1, n - 1) }),
      scatter({ by: "series", y: "value" })
    )
    .mark(
      line({
        along: "month",
        stroke: "series",
        strokeWidth: 2,
        curve: "straight",
      })
    )
    .render(container, { w: W, h: 300 });
}
```

### Area chart

```js
import { chart, scatter, stack, ribbon } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ year, value }]
  return chart(data, { axes: true })
    .flow(
      scatter({ by: "year", x: "year" }),
      stack({ by: () => "all", dir: "y" }) // one band; gives the y axis
    )
    .mark(
      ribbon({ h: "value", fill: "steelblue", opacity: 0.8, curve: "straight" })
    )
    .render(container, { w: 500, h: 300 });
}
```

### Stacked area chart

```js
import { chart, scatter, stack, ribbon } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ year, series, value }]
  return chart(data, { axes: true })
    .flow(scatter({ by: "year", x: "year" }), stack({ by: "series", dir: "y" }))
    .mark(ribbon({ h: "value", fill: "series", opacity: 0.8 }))
    .render(container, { w: 500, h: 300 });
}
```

### Pie chart and donut chart

```js
import { chart, stack, rect, clock } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ category, value }]
  return chart(data, { coord: clock() }) // no axes: a pie needs only the legend
    .flow(stack({ by: "category", dir: "x" }))
    .mark(
      rect({ w: "value", fill: "category", stroke: "white", strokeWidth: 1 })
    )
    .render(container, { w: 400, h: 400 });
}
```

For a donut, use `coord: clock({ innerRadius: 0.5 })`. Leave `axes` off for pies and donuts. With `axes: true` GoFish draws a ring of cumulative value ticks around the pie.

### Histogram

```js
import { chart, derive, bin, scatter, rect } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ height }] raw observations
  return chart(data, { axes: true })
    .flow(
      derive(bin("height", { thresholds: 12 })), // rows become { start, end, count }
      scatter({ xMin: "start", xMax: "end" })
    )
    .mark(rect({ h: "count" }))
    .render(container, { w: 500, h: 300 });
}
```

This gives a continuous x axis with bars touching. Another way, with a category axis of bin labels: `.flow(spread({ by: field("height").bin(), dir: "x", spacing: 1 })).mark(rect({ h: field("height").count() }))`.

### Heatmap

```js
import { chart, table, rect, gradient } from "gofish-graphics";

export default function render(container, data) {
  // data: [{ hour, day, value }]
  return chart(data, { axes: true, color: gradient("blues") })
    .flow(table({ by: { x: "hour", y: "day" }, spacing: 2 }))
    .mark(
      rect({ fill: "value" }).label("value", {
        position: "center",
        fontSize: 10,
      })
    )
    .render(container, { w: 500, h: 300 });
}
```

The x category labels of a heatmap sit above the grid.

### Small multiples

Nest a second layout inside a `spread`. Panels share the y scale.

```js
import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  // one bar panel per region
  return chart(data, { axes: true })
    .flow(
      spread({ by: "region", dir: "x", spacing: 24 }),
      spread({ by: "product", dir: "x", spacing: 2 })
    )
    .mark(rect({ h: "value", fill: "product" }))
    .render(container, { w: 600, h: 300 });
}
```

Scatter panels: `.flow(spread({ by: "species", dir: "x", spacing: 40 }), scatter({ x: "x", y: "y", axes: { x: true, y: false } }))` with `.mark(circle({ r: 3 }))`. Each panel gets its own x axis and the panels share one y axis on the left.

### Filtering and deriving

```js
import { chart, filter, derive, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      filter((d) => d.value > 20),
      derive((rows) =>
        rows.map((d) => ({ ...d, label: d.name.toUpperCase() }))
      ),
      spread({ by: "label", dir: "x" })
    )
    .mark(rect({ h: "value" }))
    .render(container, { w: 500, h: 300 });
}
```

Plain JS before `chart()` works just as well: compute the rows you need, then chart them.

## Pitfalls

1. **Names are lowercase.** Use `spread`, `stack`, `scatter`, `group`, `table`, `rect`, `circle`, `line`, `ribbon`, `text`, `chart`. Capitalized forms (`Spread`, `Rect`, `StackY`) are not exported. `stackX`, `stackY`, `spreadX`, `spreadY` exist, but they are low-level combinators and do not belong in `.flow()`. Use `spread`/`stack` with `dir`.
2. **`dir` is required** on `spread` and `stack`, and it is `"x"` or `"y"`. There are no `direction`, `orient`, `groupBy`, or `field` options. Grouping is always `by`.
3. **Axes are off by default.** Add `axes: true` to `chart()` or `.render()`. Leave them off for pies and donuts.
4. **Match the size channel to the direction.** Vertical bars use `spread(dir: "x")` with `rect({ h })`. Horizontal bars use `spread(dir: "y")` with `rect({ w })`. Pie slices use `stack(dir: "x")` with `rect({ w })` in `clock()`.
5. **Grouped vs stacked** differ only in the inner `stack`'s `dir`: `"x"` puts the bars side by side, `"y"` stacks them.
6. **A field name in a channel is aggregated.** `h`/`w`/`r` sum over the rows in the group and `x`/`y` average them. If the data has several rows per bar and you want the mean, use `field("v").mean()`. For a count, use `field("anyField").count()`.
7. **`scatter` without `by` draws one mark per row. With `by`, it draws one mark per group, at the group's mean position.** Lines need one point per x value in each series: use `scatter({ by: xField, x: xField, y })`, with `group({ by: series })` first for multiple lines.
8. **Continuous axes need numbers.** Convert numeric strings with `Number()`. `Date` objects give raw millisecond ticks, and date strings in `scatter` give no x labels. For time, use a number (year, or year + month/12), or treat dates as categories with the "Line chart over categories" pattern. Sort the rows by time first.
9. **Drop rows with missing values** in the fields you plot (`null`, `undefined`, `NaN`). They break scales.
10. **A string channel value is a field only if the field exists.** `fill: "red"` is a color. `fill: "Red"` is a color too, unless your data has a field named `Red`. A typo in a field name silently becomes a (probably invalid) color or a zero size, not an error.
11. **Only `tableau10` is a named categorical palette.** `palette("category10")` or `palette("Set2")` is treated as one literal color. Pass an array of hex colors instead. Named gradients are `"blues"`, `"reds"`, `"viridis"`.
12. **One `.mark()` per chart.** To draw more (points plus lines, labels plus bars), use `.label()` on the mark or `.layer(chart().flow(...).mark(...))`.
13. **Do not set `w` on bars in a `spread`** unless you want fixed widths. The bar width is inferred to fill the plot.
14. **`w`/`h` in `.render()` size the plot area, not the whole SVG.** Axes and the legend add roughly 100px of width and 95px of height, plus about 100px for a legend.
15. **Lines and areas are smoothed by default.** Pass `curve: "straight"` for straight segments, which is what most line charts should show.
16. **`.render()` is async.** Return its Promise from `render()`. Do not call `.render()` twice on the same container.
17. **No `datum.` prefix** in `by` or channel names. Write `by: "species"`, not `by: "datum.species"`.
