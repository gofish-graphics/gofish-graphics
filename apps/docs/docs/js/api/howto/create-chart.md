# How to create a chart

GoFish uses a builder pattern to create charts. You chain four methods together: `chart`, `flow`, `mark`, and `render`.

## Basic pattern

```ts
chart(data)
  .flow(operators...)
  .mark(visualMark)
  .render(container, options)
```

Each method has a specific role:

| Method         | Purpose                                   |
| -------------- | ----------------------------------------- |
| `chart(data)`  | Creates a builder with your dataset       |
| `.flow(...)`   | Applies layout operators to position data |
| `.mark(...)`   | Sets the visual representation            |
| `.render(...)` | Renders the chart to a DOM element        |

## Step 1: chart

`chart(data)` creates a ChartBuilder with your dataset. The data can be any array of objects:

```ts
const data = [
  { category: "A", value: 30 },
  { category: "B", value: 50 },
  { category: "C", value: 20 },
];

chart(data);
```

You can also pass options for coordinate transforms (like polar coordinates for pie charts):

```ts
chart(data, { coord: clock() });
```

## Step 2: flow

`.flow()` accepts one or more **operators** that determine how data is laid out spatially. The main operators are:

- `spread(field, options)` — divides space into separate regions for each group
- `stack(field, options)` — stacks items edge-to-edge along a shared scale
- `scatter(field, options)` — positions items by x/y coordinates

```ts
.flow(spread({ by: "category",  dir: "x" }))
```

The `dir` option specifies the direction: `"x"` for horizontal, `"y"` for vertical.

See [How to pick a layout operator](/js/api/howto/operators) for guidance on choosing between them.

## Step 3: mark

`.mark()` specifies how each data item should appear visually. Common marks include:

- `rect()` — rectangles (bars)
- `circle()` — circles
- `line()` — connecting line
- `area()` — filled area

Mark options can use fixed values or reference data fields:

```ts
.mark(rect({ h: "value", fill: "category" }))
```

Here `h: "value"` means the rectangle height comes from each item's `value` field, and `fill: "category"` maps the fill color to the `category` field.

## Step 4: render

`.render()` renders the chart into a DOM element:

```ts
.render(container, { w: 400, h: 300, axes: true })
```

Options:

- `w` — width in pixels
- `h` — height in pixels
- `axes` — `boolean | { x: boolean; y: boolean }` (use object form to toggle x/y axes individually)

## Composing operators

You can pass multiple operators to `.flow()` to create nested layouts. Operators apply in order—the first groups and positions the data, then subsequent operators work within those groups.

**Example: Stacked bar chart**

To create a stacked bar chart, use `spread` to separate categories horizontally, then `stack` to stack items within each category:

::: gofish

```js
const data = [
  { category: "A", group: "X", value: 30 },
  { category: "A", group: "Y", value: 20 },
  { category: "B", group: "X", value: 50 },
  { category: "B", group: "Y", value: 35 },
  { category: "C", group: "X", value: 20 },
  { category: "C", group: "Y", value: 15 },
];

gf.chart(data)
  .flow(
    gf.spread({ by: "category", dir: "x" }),
    gf.stack({ by: "group", dir: "y" })
  )
  .mark(gf.rect({ h: "value", fill: "group" }))
  .render(root, { w: 400, h: 300, axes: true });
```

:::

The first operator (`spread`) creates separate regions for each category along the x-axis. The second operator (`stack`) stacks the groups vertically within each region.

## Complete examples

### Basic bar chart

A simple bar chart with one bar per category:

::: gofish

```js
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 300, axes: true });
```

:::

### Grouped bar chart

To group bars side-by-side instead of stacking, use `spread` for both levels (same direction):

::: gofish

```js
gf.chart(seafood)
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.spread({ by: "species", dir: "x", spacing: 0 })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .render(root, { w: 400, h: 300, axes: true });
```

:::

### Stacked bar chart

To stack bars, use `spread` then `stack` (perpendicular directions):

::: gofish

```js
gf.chart(seafood)
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .render(root, { w: 400, h: 300, axes: true });
```

:::
