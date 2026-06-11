# line

Connects data points center-to-center with a line. Takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

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
    .Chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "steelblue", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
line({ stroke?, strokeWidth = 1, opacity?, interpolation = "linear" })
```

## Parameters

| Option          | Type                   | Description        |
| --------------- | ---------------------- | ------------------ |
| `stroke`        | `string`               | Line color         |
| `strokeWidth`   | `number`               | Line thickness     |
| `opacity`       | `number`               | Opacity (0–1)      |
| `interpolation` | `"linear" \| "bezier"` | Line interpolation |

## Sugar: `.connect()`

When the line connects a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.connect()`](/js/api/core/connect) on the builder:

```ts
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(circle())
  .connect(line({ stroke: "steelblue", strokeWidth: 2 }));
```

See [`.connect()`](/js/api/core/connect) for the full semantics; the explicit
`layer([...])` + `selectAll` form below connects _another_ chart's marks.

## Example

```ts
// First chart: bar chart with named layer
chart(data)
  .flow(spread({ by: "x", dir: "x" }))
  .mark(rect({ h: "y" }).name("bars"))
  .render(container, { w: 500, h: 300 });

// Second chart: line over the same bars
chart(selectAll("bars"))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
  .render(container, { w: 500, h: 300 });
```
