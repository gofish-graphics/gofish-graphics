# line

Connects data points center-to-center with a line. Takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.layer([
  gf
    .chart(locations)
    .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
    .mark(gf.blank().name("points")),
  gf
    .chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "steelblue", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
line({ stroke?, strokeWidth = 1, opacity?, curve = "auto", from?, to? })
```

## Parameters

| Option        | Type                                  | Description                                                                                                         |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `stroke`      | `string`                              | Line color                                                                                                          |
| `strokeWidth` | `number`                              | Line thickness                                                                                                      |
| `opacity`     | `number`                              | Opacity (0–1)                                                                                                       |
| `curve`       | `"straight" \| "bezier" \| CurveSpec` | Screen-space path shape; default `"auto"` auto-smooths continuous line charts with a centripetal Catmull-Rom spline |
| `from`, `to`  | `string`                              | Pairwise form: column names holding the two endpoint refs                                                           |

When `curve` is omitted (`"auto"`), `line` inspects the connected points: if they
share a continuous connection axis it smooths them with a centripetal Catmull-Rom
spline, otherwise it draws a straight polyline.

`curve` accepts the strings `"straight"` or `"bezier"`, or a `CurveSpec` factory:
`straight()`, `bezier()`, `orthogonal({ bend? })`, `arc({ direction: "up" | "down" })`,
or `perfectArrows({ bow })`. The `orthogonal` elbow bends at the midpoint of the
connector's `dir` axis; pass `orthogonal({ bend: "auto" })` to infer the bend axis
from the endpoint geometry instead (for layouts with no single growth axis).

## Two forms

- **Bag form** — `line()` over a `GoFishRef[]` (e.g. [`selectAll()`](/js/api/selection/ref)):
  one polyline through all the refs (the example above).
- **Pairwise form** — `line({ from, to })` over rows whose `from`/`to` columns
  hold refs: one segment per row. Use after [`resolve`](/js/api/operators/resolve)
  has turned an edge table's endpoint ids into node refs — this is how node-link
  edges are drawn. See [`.layer()`](/js/api/core/layer) for the full recipe.

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
