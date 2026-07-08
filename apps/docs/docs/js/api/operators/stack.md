# stack

Shorthand for [`spread`](/js/api/operators/spread)`({ glue: true })`. Children
are glued together and their data-driven sizes sum into a continuous
positional axis at this level. Used for stacked bar charts.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
// Operator form:
stack({ by?, dir, alignment?, ... })

// Combinator form:
stack({ dir, ... }, [m1, m2, ...])
```

## Parameters

Same as [`spread`](/js/api/operators/spread) without `spacing` or `glue` —
`stack` always glues, so neither is configurable. Its `by` is the same
path-aware option (`"field"`, `"datum.field"` after a
[selection](/js/api/selection/ref), a function, or a
[`field(...)`](/js/api/operators/spread#field-expression-pipeline) accessor); see
[`spread` → path-aware `by`](/js/api/operators/spread#path-aware-by). If you want gaps between
children plus a continuous data axis, use `spread({ spacing: N })` —
`spread`'s "data-driven SIZE composition" mode is the natural fit there.

`size` sets each entry's stack-axis extent (a field name, a `field(...)`
accessor, or an explicit array). Set it to `field(<name>).normalize()` to make
a stack a **space-filling spine** — its segments fill the extent in
proportion to their share (the mosaic/marimekko conditional axis). See
[`spread` → Field-expression pipeline](/js/api/operators/spread#field-expression-pipeline)
and [`spread` → Space-filling spines](/js/api/operators/spread#space-filling-spines-mosaic-marimekko).

## Example

```ts
// Stacked bar chart grouped by "site", stacked by "variety"
.flow(
  spread({ by: "variety", dir: "x" }),
  stack({ by: "site", dir: "y" })
)
```
