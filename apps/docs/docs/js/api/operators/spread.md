# spread

Partitions data by the `by` field and lays out one child per partition along an axis. The primary layout operator.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
// Operator form (inside .flow):
spread({ by?, dir, spacing?, alignment?, glue?, ... })

// Combinator form (apply n marks to one datum):
spread({ dir, ... }, [m1, m2, ...])
```

## Parameters

| Option        | Type                                          | Default      | Description                                                                                                                                                                                                                                                                                                    |
| ------------- | --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`          | `string \| FieldExpr \| function`             | —            | Field, [`field(...)`](#field-expression-pipeline) accessor, or function to partition by; omit for per-item spread                                                                                                                                                                                              |
| `dir`         | `"x" \| "y"`                                  | —            | **Required.** Layout axis                                                                                                                                                                                                                                                                                      |
| `spacing`     | `number`                                      | `8`          | Gap between children. Ignored when `glue: true`                                                                                                                                                                                                                                                                |
| `alignment`   | `"start" \| "middle" \| "end" \| "baseline"`  | `"baseline"` | Alignment along the off-axis                                                                                                                                                                                                                                                                                   |
| `mode`        | `"edge" \| "center"`                          | `"edge"`     | Whether `spacing` is measured edge-to-edge or center-to-center                                                                                                                                                                                                                                                 |
| `reverse`     | `boolean`                                     | `false`      | Reverse children order along `dir`                                                                                                                                                                                                                                                                             |
| `sharedScale` | `boolean`                                     | `false`      | Share scale across all children                                                                                                                                                                                                                                                                                |
| `glue`        | `boolean`                                     | `false`      | Glue children together: collapse data-driven sizes into a single positional axis at this level (the underlying-space kind becomes POSITION). [`stack`](./stack) sets this.                                                                                                                                     |
| `w`, `h`      | `number \| string`                            | —            | Fixed dimension, or field name to encode this operator's own box size from data (e.g. a mosaic column's width)                                                                                                                                                                                                 |
| `size`        | `string \| FieldExpr \| MaybeValue<number>[]` | —            | Per-entry stack-axis extent — a field name, a [`field(...)`](#field-expression-pipeline) accessor, or an explicit array with one value per split entry. `size: field("count").normalize()` makes the stack axis a **space-filling spine**. See [Space-filling spines](#space-filling-spines-mosaic-marimekko). |

## Examples

```ts
// Horizontal bar chart: one bar per "letter"
.flow(spread({ by: "letter", dir: "x" }))

// Vertical layout with fixed width per group
.flow(spread({ by: "category", dir: "y", w: 40 }))

// Combinator form: apply different marks to the same datum
spread({ dir: "x" }, [rect({ h: "v" }), text({ text: "n" })])
```

## Path-aware `by` {#path-aware-by}

`by` accepts a **field name**, a **lodash path string**, a **function**, or a
[`field(...)`](#field-expression-pipeline) accessor:

```ts
spread({ by: "species", dir: "x" }); // field on a raw record
spread({ by: "datum.species", dir: "x" }); // path (e.g. after a selection)
spread({ by: (r) => r.datum.species, dir: "x" }); // function escape hatch
spread({ by: field("species").sort(), dir: "x" }); // field(...) accessor
```

Path strings matter after a [`ref` / `selectAll`](/js/api/selection/ref) selection:
the stream items are then [`ref`](/js/api/marks/ref)s, not raw records, so you
re-encode by the datum path — `by: "datum.species"`.

### How a `datum.field` path resolves (homogeneity collapse) {#homogeneity-collapse}

A ref's [`.datum`](/js/api/marks/ref#datum) is the **raw bag of rows** that
flowed into the node (an array; a fully-split leaf is a 1-row array). A
`by: "datum.field"` path does **not** just `_.get` the field off the first row —
it **projects with homogeneity collapse**:

> `datum.field` resolves to a scalar **iff every row in the node's bag agrees on
> that field**; otherwise it is `undefined` — the "this field is multi-valued
> here, grouping by it is ill-posed" signal.

This is exactly SQL's `ONLY_FULL_GROUP_BY` / functional-dependency rule: you may
only group by a column that is constant within each row-bag.

**Example.** After `selectAll("bars")` where each ref is a _lake_ aggregate of 5
species rows:

```ts
group({ by: "datum.lake" }); // resolves — all 5 rows share one lake
group({ by: "datum.species" }); // undefined — 5 distinct species; ill-posed
```

To group by a field that is multi-valued in the current bag, **disaggregate
first** (split the bag so each child is homogeneous in that field) or use the
function escape hatch on raw rows. A fully-split cell (1 row) trivially
collapses, so `by: "datum.species"` works once each node holds a single record.

To read _every_ value at a multi-valued path instead of collapsing to a scalar,
use [`pluck`](/js/api/selection/ref#pluck) — the un-collapsed counterpart of
`by`.

### `by` vs. channel: an intentional asymmetry

`by` operates on the **selection stream**, but a mark's channels operate on the
**raw record** — and they are addressed differently:

| Place                                   | Reads          | How to write `species`   |
| --------------------------------------- | -------------- | ------------------------ |
| `by` on an operator after a selection   | the ref stream | `"datum.species"` (path) |
| a channel on a mark, e.g. `rect({ … })` | the raw record | `"species"` (bare field) |

So a ribbon chart reads:

```ts
chart(selectAll("bars")) // stream of refs
  .flow(group({ by: "datum.species" })) // by → ref stream → datum path
  .mark(ribbon({ opacity: 0.8 })); // channel → raw record, no prefix
```

Do **not** "consistency-refactor" channels into `datum.count` — a channel like
`rect({ h: "count" })` reads the bound record directly and is never
path-prefixed. Only `by` (on `group`/`spread`/`stack`/`scatter`) is path-aware,
because only `by` sees the selection stream.

## `spacing` vs `glue`

`spacing` controls the visual gap between children. `glue` controls whether
children's data-driven sizes get summed into a positional axis at this level:

- `glue: false` (default): real spread. Each child keeps its data-driven
  size; the underlying-space kind on `dir` is SIZE (or ORDINAL when children
  are categorical).
- `glue: true`: stack semantics. Children are pushed together (regardless
  of `spacing`), and their cumulative size becomes a continuous POSITION
  domain on `dir`. This is what [`stack`](./stack) does.

Use `spread({ spacing: 0 })` if you want children touching but with each
child still treated as its own thing (e.g. discrete-theta polar charts).
Use `stack(...)` if you want a stacked-bar feel (continuous position axis
running through the stack).

## Field-expression pipeline {#field-expression-pipeline}

`field(name)` returns a chainable expression — a builder where each method
appends one op to an ordered pipeline. It works in two disjoint places:

- As `by` (a **domain** slot): `.sort(by?, order?)`, `.sort(values)` (an
  explicit order list), `.reverse()`, and `.bin({ thresholds? })` decide
  **which groups exist and in what order**.
- As a mark or `size` channel value (a **value** slot): `.sum()`, `.mean()`,
  `.count()`, and `.distinct()` **fold a group's rows to one number**,
  overriding the channel's own default aggregation (sum for size, mean for
  position).

Mixing the two — an aggregate op on `by`, or a domain op on a value channel —
throws.

**Sort a stack's groups by another field's total**, instead of data order:

```ts
// Bars ordered ascending by their own total `value`
.flow(spread({ by: field("category").sort("value"), dir: "x" }))
.mark(rect({ h: "value" }))
```

Omit the `by` argument to sort by the group key itself; pass
`order: "desc"` for descending.

**Sort groups by an explicit order**, for a domain-specific sequence no
aggregate expresses (severity, calendar order, a fixed ranking):

```ts
// Weather categories in a fixed order, not alphabetical or by aggregate
.flow(stack({ by: field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"]), dir: "y" }))
```

Groups whose key isn't in the list are appended after, in natural sort
order.

**Bin a numeric field into groups** — a histogram, with no precomputed bins:

```ts
// One bar per ~10 auto-computed bins of `age`, height = row count per bin
.flow(spread({ by: field("age").bin(), dir: "x" }))
.mark(rect({ h: field("age").count() }))
```

Empty bins are dropped, like an ordinary `groupBy`. Pass
`field("age").bin({ thresholds: 5 })` (a count) or explicit thresholds
(an array) to control the binning.

**Override a channel's default aggregation:**

```ts
// The bar height is each species' MEAN weight, not the sum
.flow(spread({ by: "species", dir: "x" }))
.mark(rect({ h: field("weight").mean() }))
```

`.count()` and `.distinct()` report measure `"count"` (they're counts, not the
source field's own units) unless you annotate the accessor explicitly:
`field("id", "my-measure").distinct()`.

## Space-filling spines (mosaic / marimekko)

`size: field(<name>).normalize()` turns a stack's entries into a
**space-filling spine**: each entry's size becomes its SHARE of the window
(the operator's own split entries, `v_e / Σv_e`), so the axis reads as a local
0–100% conditional distribution. It replaces the removed `normalize: true`
layout flag — `.normalize()` is a **data** transform on the `size` channel
(a windowed share, computed once up front), not a layout mode, so the same
field can drive both a cross-axis marginal size and the normalized fill with
no preprocessing.

That is exactly a mosaic. Nest two stacks on alternating axes: the outer sizes
each column by its raw total (`size: "count"` — the marginal), the inner
`size`s by each entry's share (the conditional). Both come off one raw
field — no per-cell aggregation or precomputed totals:

```ts
chart(passengers, { axes: true })
  .flow(
    // columns by class — width ∝ each class's count (marginal)
    stack({ by: "pclass", dir: "x", size: "count" }),
    // survival share within each column (conditional), filling height
    stack({ by: "survived", dir: "y", size: field("count").normalize() })
  )
  .mark(rect({ fill: "survived", stroke: "white", strokeWidth: 1 }))
  .render(container, { w: 400, h: 300 });
```

::: gofish example:titanic-survival-mosaic hidden
:::

`.normalize()` composes to any depth: a third alternating level gives a nested
mosaic (`class → sex → survived`). Because each level's stacking axis is a
local self-scaling region and the count is read raw everywhere, the marginal ×
conditional × … area factorization holds all the way down.

::: warning
Inner conditional axes are local scopes, so they don't yet render 0–1 tick
labels — only the outermost marginal axis is labeled.
:::
