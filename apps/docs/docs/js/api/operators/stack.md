---
order: 20
---

# stack

Adds its children's data amounts along `dir`. Each part starts where the one
before it ends, and the parts share one data axis. Used for stacked bar charts.

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

## Parts are data amounts

Every part needs a data size along `dir`: a `rect({ h: "count" })`, a ribbon
with a data `h`, or another stack. A part sized in pixels or by its content (a
`rect({ h: 20 })`, a `text`, an `image`, a `spread`) has no amount to add, so
it is an error that names the part. Parts like these only touch. Lay them out
with [`spread`](/js/api/operators/spread)`({ dir, spacing: 0 })`.

## Signature

```ts
// Operator form:
stack({ by?, dir, alignment?, baseline?, ... })

// Combinator form:
stack({ dir, ... }, [m1, m2, ...])
```

## Parameters

::: gofish-ref stack
:::

`dir` takes `"x"`, `"y"`, or an axis name the enclosing coordinate space
declares, such as `"theta"` under polar; see
[`spread` → naming the axis](/js/api/operators/spread#naming-the-axis-with-dir).

Same as [`spread`](/js/api/operators/spread) without `spacing`:
the parts touch, so there is no gap to set. Its `by` is the same
path-aware option (`"field"`, which also works on refs after a
[selection](/js/api/selection/ref), a function, or a
[`field(...)`](/js/api/operators/spread#field-expression-pipeline) accessor); see
[`spread` → path-aware `by`](/js/api/operators/spread#path-aware-by). For gaps
between the parts, use `spread({ spacing: N })`.

`size` sets each entry's stack-axis extent (a field name, a `field(...)`
accessor, or an explicit array). Set it to `field(<name>).normalize()` to make
a stack a **space-filling spine** — its segments fill the extent in
proportion to their share (the mosaic/marimekko conditional axis). See
[`spread` → Field-expression pipeline](/js/api/operators/spread#field-expression-pipeline)
and [`spread` → Space-filling spines](/js/api/operators/spread#space-filling-spines-mosaic-marimekko).

## Signed parts

`stack` places its parts end to end, in order. Each part starts where the one
before it ends, and the first part starts at 0. A negative part goes back, so
the stack ends at the sum of its parts, and parts that cancel overlap. Parts
(+100, −30, +20, −50, +10) rise to 100, step back and forth, and end at 50.

To pile positive parts up from 0 and negative parts down from 0 (a diverging
stacked bar), group by sign first, so each stack holds one sign:

```ts
// `direction` is "Inflow" for positive amounts and "Outflow" for negative.
.flow(
  spread({ by: "quarter", dir: "x" }),
  group({ by: "direction" }),
  stack({ by: "flow", dir: "y" })
)
```

## Baselines

`baseline` sets where the stack puts its own 0, the point its parent lines up
with its other children. It takes a member of the
[`Baseline`](/js/api/baseline) family: `Baseline.start()` (the default),
`Baseline.end()`, `Baseline.middle()`, `Baseline.wiggle()` or
`Baseline.at(part, point)`.

```ts
stack({ by: "response", dir: "x", baseline: Baseline.at("Neutral", 0.5) });
```

## Centered stacks

When the chart's `schema` gives the `by` column a midpoint
([`Unit({ domain: Domain.discrete(levels), traits: [Trait.diverging()] })`](/js/api/core/schema)), the stack's 0 is
the midpoint of that order instead of the start of its first part: a
`Baseline.at` at that midpoint. The parts must be nonnegative, and the stack
takes no `baseline` option. This draws Likert charts and population pyramids:

```ts
chart(survey, {
  schema: {
    response: Unit({
      domain: Domain.discrete(LEVELS),
      traits: [Trait.diverging()],
    }),
  },
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "count", fill: "response" }));
```

## Stacked areas

A stack of [shape-form ribbons](/js/api/marks/ribbon#shape-form) is a stacked
area. A band's thickness changes along `x`, so the stack moves each band by
an amount that changes along `x` too: the thickness of the bands before it,
moved by the baseline. Each band keeps its thickness at every `x`. Outside its
own rows a band has thickness 0, so series may be sampled at different `x`.

```ts
chart(unemployment, { schema: { date: Unit.time() } })
  .flow(stack({ by: "series", dir: "y" }))
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));
```

::: gofish example:stacked-area-chart hidden
:::

With `Baseline.wiggle()` the stack is a streamgraph. With `Baseline.middle()`
it is centered at every `x`.

```ts
chart(unemployment, { schema: { date: Unit.time() } })
  .flow(stack({ by: "series", dir: "y", baseline: Baseline.wiggle() }))
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));
```

::: gofish example:streamgraph hidden
:::

Every part of such a stack must be a band. A `rect` or a `text` in a stack of
bands is an error.

## Example

```ts
// Stacked bar chart grouped by "site", stacked by "variety"
.flow(
  spread({ by: "variety", dir: "x" }),
  stack({ by: "site", dir: "y" })
)
```
