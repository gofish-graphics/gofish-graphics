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
ribbon({ stroke?, strokeWidth = 0, opacity?, mixBlendMode = "normal", dir = "x", curve = "auto", by?, from?, to?, w?, h?, emX?, emY? })
```

## Parameters

| Option         | Type                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stroke`       | `string`                                         | Stroke color                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `strokeWidth`  | `number`                                         | Stroke width                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `opacity`      | `number`                                         | Opacity (0–1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mixBlendMode` | `"normal" \| "multiply"`                         | Blend mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `dir`          | `"x" \| "y"`                                     | Direction axis                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `curve`        | `"straight" \| "bezier" \| CurveSpec`            | Screen-space band shape; default `"auto"` (see below)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `by`           | `string \| FieldExpr \| (ref) => string`         | Partitions the operand bag (the array of refs) into groups and draws one band per group. Same grammar as any operator's `by` — bare field name, key function, or [`field(...)`](/js/api/operators/spread#field-expression-pipeline) accessor. Resolves against the refs' own datum automatically (no `datum.` prefix), same as `group({ by })`. Composes with an upstream `group()` as a nested split.                                                                       |
| `from`, `to`   | `string`                                         | Pairwise form: column names holding the two endpoint refs                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `w`, `h`       | `number \| string \| Value<number> \| FieldExpr` | **Ignored by `ribbon` itself.** Blank-fusion anchor keys: read only when `ribbon(opts)` is placed directly in `.mark()` position, where they become the invisible anchor tier's `blank({w, h, emX, emY})` opts — same channel-value shapes as a leaf mark's "size" channel (e.g. rect's `h`), including a `field(...)` pipeline like `field("count").sum()`. See [`.layer()`'s blank-fusion section](/js/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart). |
| `emX`, `emY`   | `boolean`                                        | **Ignored by `ribbon` itself.** Blank-fusion anchor keys — see `w`/`h` above.                                                                                                                                                                                                                                                                                                                                                                                                |

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

## Sugar: `.mark(ribbon(...))` (blank-fusion)

When there's no earlier tier at all — just raw data that needs both fresh
anchors and a connector — place `ribbon(...)` directly in `.mark()` position
and skip `.layer()` too. This is the fused spelling of the [Area chart](/js/examples/area-chart)
and [Ridgeline chart](/js/examples/ridgeline-chart) gallery examples:

```ts
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x", spacing: 64 }))
  .mark(ribbon({ h: "count", opacity: 0.8 }));

// ...is sugar for the explicit two-tier form:
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x", spacing: 64 }))
  .mark(blank({ h: "count" }))
  .layer(ribbon({ opacity: 0.8 }));
```

A `by`-split ribbon's `fill` can be a shared field name (each group is
homogeneous in it): `ribbon({ h: "count", fill: "species", by: "species" })`
resolves `fill` through the color scale per group, the same as it would if
`fill` were declared on an explicit anchor `blank()`.

See [`.layer()`'s blank-fusion section](/js/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart)
for the full desugaring rule (the `{w, h, emX, emY}` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`emX`/`emY` anchor channels are only meaningful when `ribbon` gets
to synthesize its own anchors this way; passing them to a `ribbon` that
instead connects already-drawn marks (an empty-scope `chart()` tier inside
`.layer()`, or `chart(selectAll(...))`/`chart(ref(...))`) is an error, since
there's nothing left for them to anchor.

## Example

```ts
chart(selectAll("bars"))
  .mark(ribbon({ opacity: 0.3 }))
  .render(container, { w: 500, h: 300 });
```
