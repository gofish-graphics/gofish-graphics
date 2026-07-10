# ribbon

Fills a band between data points (edge-to-edge) — areas, streamgraphs, and sankey ribbons. Takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

::: gofish

```js
const lakeTotals = Object.entries(_.groupBy(seafood, "lake")).map(
  ([lake, items]) => ({
    lake,
    count: items.reduce((sum, item) => sum + item.count, 0),
  })
);

gf.layer([
  gf
    .chart(lakeTotals)
    .flow(gf.spread({ by: "lake", dir: "x", spacing: 64 }))
    .mark(gf.blank({ h: "count" }).name("points")),
  gf.chart(gf.selectAll("points")).mark(gf.ribbon({ opacity: 0.6 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
ribbon({ stroke?, strokeWidth = 0, opacity?, mixBlendMode = "normal", dir = "x", curve = "auto", by?, from?, to? })
```

## Parameters

| Option         | Type                                     | Description                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stroke`       | `string`                                 | Stroke color                                                                                                                                                                                                                                                                                                                                                                                           |
| `strokeWidth`  | `number`                                 | Stroke width                                                                                                                                                                                                                                                                                                                                                                                           |
| `opacity`      | `number`                                 | Opacity (0–1)                                                                                                                                                                                                                                                                                                                                                                                          |
| `mixBlendMode` | `"normal" \| "multiply"`                 | Blend mode                                                                                                                                                                                                                                                                                                                                                                                             |
| `dir`          | `"x" \| "y"`                             | Direction axis                                                                                                                                                                                                                                                                                                                                                                                         |
| `curve`        | `"straight" \| "bezier" \| CurveSpec`    | Screen-space band shape; default `"auto"` (see below)                                                                                                                                                                                                                                                                                                                                                  |
| `by`           | `string \| FieldExpr \| (ref) => string` | Partitions the operand bag (the array of refs) into groups and draws one band per group. Same grammar as any operator's `by` — bare field name, key function, or [`field(...)`](/js/api/operators/spread#field-expression-pipeline) accessor. Resolves against the refs' own datum automatically (no `datum.` prefix), same as `group({ by })`. Composes with an upstream `group()` as a nested split. |
| `from`, `to`   | `string`                                 | Pairwise form: column names holding the two endpoint refs                                                                                                                                                                                                                                                                                                                                              |

`curve` accepts the strings `"straight"` or `"bezier"`, or a `CurveSpec` factory:
`straight()`, `bezier()`, `orthogonal()`, `arc({ direction: "up" | "down" })`, or
`perfectArrows({ bow })`. The default `"auto"` inspects the connection axis: over a
homogeneous **continuous** axis (a stacked area / streamgraph sampling a continuous
variable) it smooths the band edges with a centripetal Catmull-Rom spline — matching
its [`line`](/js/api/marks/line) sibling — and otherwise draws a **bezier** band
(the band equivalent of a straight line: the honest connector between discrete
regions, as in a sankey or a categorical ribbon).

Like [`line`](/js/api/marks/line), `ribbon` has a **bag form** (over a `GoFishRef[]`,
shown below) and a **pairwise form** `ribbon({ from, to })` over rows whose
`from`/`to` columns hold refs (one band per row, after
[`resolve`](/js/api/operators/resolve)).

## Sugar: `.layer(ribbon({ by }))`

When the ribbon traces a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.layer()`](/js/api/core/layer) with `by` on the builder —
this is the canonical simple ribbon-chart spelling:

```ts
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(rect({ h: "count", fill: "species" }))
  .layer(ribbon({ by: "species", opacity: 0.8 }))
  .render(container, { w: 400, h: 400 });
```

See [`.layer()`](/js/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit `layer([...])`

- `selectAll` form below (which is still what you want to trace _another_
  chart's marks).

## Example

```ts
chart(selectAll("bars"))
  .mark(ribbon({ opacity: 0.3 }))
  .render(container, { w: 500, h: 300 });
```
