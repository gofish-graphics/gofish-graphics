# How to use selection

Selection lets you connect marks across charts—for example, adding labels to bars or drawing a line through scatterplot points. It works in two steps:

1. **Name a mark** using `.name("layerName")` to register its nodes
2. **Select those nodes** using `select("layerName")` as data for another chart

## Basic pattern

```ts
Layer([
  // Chart 1: create marks and name them
  Chart(data)
    .flow(spread({ by: "category", dir: "x" }))
    .mark(rect({ h: "value" }).name("bars")),

  // Chart 2: select those marks as data
  Chart(select("bars")).mark(/* overlay mark */),
]);
```

The `Layer` function renders both charts in the same coordinate space, allowing the second chart to overlay the first.

## Example: Bar chart with labels

Add text labels above each bar by selecting the bar nodes and rendering text at their positions:

::: starfish

```js
gf.Layer([
  gf
    .Chart(seafood)
    .flow(gf.spread({ by: "lake", dir: "x" }))
    .mark(gf.rect({ h: "count" }).name("bars")),
  gf
    .Chart(gf.select("bars"))
    .flow(gf.group({ by: "lake" }))
    .mark((d) =>
      gf.Spread({ dir: "y", alignment: "middle", spacing: 10 }, [
        gf.ref(d[0]),
        gf.text({ text: d[0].count }),
      ])
    ),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

Here, `select("bars")` returns the bar nodes with their original data attached. The mark function receives each node and creates a vertical spread containing a reference to the bar (`ref`) and a text label.

## Example: Connected scatterplot

Draw a line connecting scatterplot points:

::: starfish

```js
gf.Layer([
  gf
    .Chart(drivingShifts)
    .flow(gf.scatter({ by: "year", x: "miles", y: "gas" }))
    .mark(
      gf
        .circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 })
        .name("points")
    ),
  gf
    .Chart(gf.select("points"))
    .mark(gf.line({ stroke: "black", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

The `line` mark automatically connects all selected points in order.

## Example: Invisible blank with line

Sometimes you want a connecting line without visible points. Use `blank()` to create invisible anchor points:

::: starfish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.Layer([
  gf
    .Chart(locations)
    .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
    .mark(gf.blank().name("points")),
  gf
    .Chart(gf.select("points"))
    .mark(gf.line({ stroke: "steelblue", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## How it works

When you call `.name("layerName")` on a mark, each node it produces is registered in a shared layer context during rendering. The `select("layerName")` function returns a lazy selector that resolves to those nodes when the second chart renders.

Each selected node includes:

- The original data from the first chart
- A `__ref` property pointing to the actual rendered node

This allows overlay marks to position themselves relative to the original marks and access their data for labels or styling.

## Common use cases

| Goal                | Pattern                                                   |
| ------------------- | --------------------------------------------------------- |
| Labels on bars      | `rect().name("bars")` → `select("bars")` + `text`         |
| Line through points | `circle().name("points")` → `select("points")` + `line()` |
| Area under line     | `blank().name("points")` → `select("points")` + `area()`  |
| Annotations         | Name any mark → select and add custom overlay             |
