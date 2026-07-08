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
ribbon({ stroke?, strokeWidth = 0, opacity?, mixBlendMode = "normal", dir = "x", curve = "auto", from?, to? })
```

## Parameters

| Option         | Type                                  | Description                                               |
| -------------- | ------------------------------------- | --------------------------------------------------------- |
| `stroke`       | `string`                              | Stroke color                                              |
| `strokeWidth`  | `number`                              | Stroke width                                              |
| `opacity`      | `number`                              | Opacity (0–1)                                             |
| `mixBlendMode` | `"normal" \| "multiply"`              | Blend mode                                                |
| `dir`          | `"x" \| "y"`                          | Direction axis                                            |
| `curve`        | `"straight" \| "bezier" \| CurveSpec` | Screen-space band shape; default `"auto"` (see below)     |
| `from`, `to`   | `string`                              | Pairwise form: column names holding the two endpoint refs |

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

## Sugar: `.connect()`

When the area traces a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.connect()`](/js/api/core/connect) on the builder:

```ts
chart(data)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(blank({ h: "count" }))
  .connect(ribbon({ opacity: 0.6 }));
```

See [`.connect()`](/js/api/core/connect) for the full semantics; the explicit
`layer([...])` + `selectAll` form below traces _another_ chart's marks.

## Example

```ts
chart(selectAll("bars"))
  .mark(ribbon({ opacity: 0.3 }))
  .render(container, { w: 500, h: 300 });
```
