# area

Fills the area between data points (edge-to-edge). Takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

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
  gf.chart(gf.selectAll("points")).mark(gf.area({ opacity: 0.6 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
area({ stroke?, strokeWidth = 0, opacity?, mixBlendMode = "normal", dir = "x", interpolation = "bezier", from?, to? })
```

## Parameters

| Option          | Type                     | Description                                               |
| --------------- | ------------------------ | --------------------------------------------------------- |
| `stroke`        | `string`                 | Stroke color                                              |
| `strokeWidth`   | `number`                 | Stroke width                                              |
| `opacity`       | `number`                 | Opacity (0–1)                                             |
| `mixBlendMode`  | `"normal" \| "multiply"` | Blend mode                                                |
| `dir`           | `"x" \| "y"`             | Direction axis                                            |
| `interpolation` | `"linear" \| "bezier"`   | Curve interpolation                                       |
| `from`, `to`    | `string`                 | Pairwise form: column names holding the two endpoint refs |

Like [`line`](/js/api/marks/line), `area` has a **bag form** (over a `GoFishRef[]`,
shown below) and a **pairwise form** `area({ from, to })` over rows whose
`from`/`to` columns hold refs (one band per row, after
[`resolve`](/js/api/operators/resolve)).

## Sugar: `.connect()`

When the area traces a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.connect()`](/js/api/core/connect) on the builder:

```ts
chart(data)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(blank({ h: "count" }))
  .connect(area({ opacity: 0.6 }));
```

See [`.connect()`](/js/api/core/connect) for the full semantics; the explicit
`layer([...])` + `selectAll` form below traces _another_ chart's marks.

## Example

```ts
chart(selectAll("bars"))
  .mark(area({ opacity: 0.3 }))
  .render(container, { w: 500, h: 300 });
```
