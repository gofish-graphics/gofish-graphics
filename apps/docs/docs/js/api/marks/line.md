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
line({ stroke?, strokeWidth = 1, strokeDasharray?, opacity?, curve = "auto", along?, from?, to?, w?, h?, emX?, emY? })
```

## Parameters

| Option            | Type                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stroke`          | `string`                                         | Line color                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `strokeWidth`     | `number`                                         | Line thickness                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `strokeDasharray` | `string`                                         | Raw SVG `stroke-dasharray` (e.g. `"12"`) for a dashed line; same option name as `enclose`                                                                                                                                                                                                                                                                                                                                                                                |
| `opacity`         | `number`                                         | Opacity (0–1)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `curve`           | `"straight" \| "bezier" \| CurveSpec`            | Screen-space path shape; default `"auto"` auto-smooths continuous line charts with a centripetal Catmull-Rom spline                                                                                                                                                                                                                                                                                                                                                      |
| `along`           | `string`                                         | Names a flow tier by its `by` field (see [Default grouping](#default-grouping)): that tier becomes the line's path, and every other grouping tier splits into separate lines. Usually omitted — the path tier is inferred from the flow shape. Naming a field that matches no tier, or using `along` on a line that doesn't fuse into a chart's own flow (a refs bag, or the pairwise `{from, to}` form), throws.                                                        |
| `from`, `to`      | `string`                                         | Pairwise form: column names holding the two endpoint refs                                                                                                                                                                                                                                                                                                                                                                                                                |
| `w`, `h`          | `number \| string \| Value<number> \| FieldExpr` | **Ignored by `line` itself.** Blank-fusion anchor keys: read only when `line(opts)` is placed directly in `.mark()` position, where they become the invisible anchor tier's `blank({w, h, emX, emY})` opts — same channel-value shapes as a leaf mark's "size" channel (e.g. rect's `h`), including a `field(...)` pipeline like `field("count").sum()`. See [`.layer()`'s blank-fusion section](/js/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart). |
| `emX`, `emY`      | `boolean`                                        | **Ignored by `line` itself.** Blank-fusion anchor keys — see `w`/`h` above.                                                                                                                                                                                                                                                                                                                                                                                              |

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

## Default grouping

A line fused into a flow — in `.mark()` position or as `.layer()` sugar over
the previous tier's marks — splits at the flow's own grouping by default: one
tier lays the line's path, and every other grouping in the flow splits it into
separate lines. You don't restate the split — the flow one line up already
declared it, and `line` has no option that spells the split directly.

When you need a _different_ path tier than the one inference would pick, name
it with `along`: `along: "year"` finds the flow tier whose `by` is `"year"`,
makes it the path, and splits by every other grouping tier instead. Naming a
field no tier groups by is an error. This doesn't apply to a line drawn over
an explicit refs bag (`chart(selectAll(...))`) or the pairwise `{ from, to }`
form — `along` is only meaningful when the line fuses into a chart's own
flow, and throws if used on either of those. A refs bag spells its split
structurally instead, with an upstream `flow(group({ by: "species" }))`.

A slope chart is a good example of why the default matters: ten barley
varieties across six field sites, one short line per site-variety pair from
1931 to 1932, with no line crossing a site boundary.

```ts
chart(barley, { axes: true })
  .flow(
    spread({ by: "site", dir: "x", spacing: 110 }),
    spread({ by: "year", dir: "x", spacing: 36 }),
    scatter({ by: "variety", y: "yield" })
  )
  .mark(line({ stroke: "variety", strokeWidth: 2 }));
```

No option at all: the innermost tier that lays out the travel axis (the
`year` spread) becomes the path, and every other grouping — `site` and
`variety` — splits, giving one line per site-variety pair. Writing the same
split by hand would take a composite key over both fields; naming it
explicitly would be `line({ along: "year", stroke: "variety", strokeWidth: 2
})`, which picks the same path tier the default already infers.

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

## Sugar: `.mark(line(...))` (blank-fusion)

When there's no earlier tier at all — just raw data that needs both fresh
anchors and a connector — place `line(...)` directly in `.mark()` position and
skip `.layer()` too:

```ts
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }));

// ...is sugar for the explicit two-tier form:
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(blank())
  .layer(line({ stroke: "steelblue", strokeWidth: 2 }));
```

See [`.layer()`'s blank-fusion section](/js/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart)
for the full desugaring rule (the `{w, h, emX, emY}` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`emX`/`emY` anchor channels are only meaningful when `line` gets to
synthesize its own anchors this way; passing them to a `line` that instead
connects already-drawn marks (an empty-scope `chart()` tier inside `.layer()`,
or `chart(selectAll(...))`/`chart(ref(...))`) is an error, since there's
nothing left for them to anchor.

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
