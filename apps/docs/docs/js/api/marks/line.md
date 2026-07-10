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
line({ stroke?, strokeWidth = 1, strokeDasharray?, opacity?, curve = "auto", by?, from?, to? })
```

## Parameters

| Option            | Type                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stroke`          | `string`                                 | Line color                                                                                                                                                                                                                                                                                                                                                                                                 |
| `strokeWidth`     | `number`                                 | Line thickness                                                                                                                                                                                                                                                                                                                                                                                             |
| `strokeDasharray` | `string`                                 | Raw SVG `stroke-dasharray` (e.g. `"12"`) for a dashed line; same option name as `enclose`                                                                                                                                                                                                                                                                                                                  |
| `opacity`         | `number`                                 | Opacity (0–1)                                                                                                                                                                                                                                                                                                                                                                                              |
| `curve`           | `"straight" \| "bezier" \| CurveSpec`    | Screen-space path shape; default `"auto"` auto-smooths continuous line charts with a centripetal Catmull-Rom spline                                                                                                                                                                                                                                                                                        |
| `by`              | `string \| FieldExpr \| (ref) => string` | Partitions the operand bag (the array of refs) into groups and draws one polyline per group. Same grammar as any operator's `by` — bare field name, key function, or [`field(...)`](/js/api/operators/spread#field-expression-pipeline) accessor. Resolves against the refs' own datum automatically (no `datum.` prefix), same as `group({ by })`. Composes with an upstream `group()` as a nested split. |
| `from`, `to`      | `string`                                 | Pairwise form: column names holding the two endpoint refs                                                                                                                                                                                                                                                                                                                                                  |

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

## Sugar: `.layer(line(...))`

When the line connects a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.layer()`](/js/api/core/layer) on the builder with a bare
`line(...)`:

```ts
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
  .layer(line({ stroke: "black", strokeWidth: 2 }));
```

See [`.layer()`](/js/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit `layer([...])`

- `selectAll` form below (which is still what you want to connect _another_
  chart's marks).

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
