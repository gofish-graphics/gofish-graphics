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

| Option        | Type                                         | Default      | Description                                                                                                                                                                                                                                                                                          |
| ------------- | -------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`          | `string`                                     | —            | Field to partition by; omit for per-item spread                                                                                                                                                                                                                                                      |
| `dir`         | `"x" \| "y"`                                 | —            | **Required.** Layout axis                                                                                                                                                                                                                                                                            |
| `spacing`     | `number`                                     | `8`          | Gap between children. Ignored when `glue: true`                                                                                                                                                                                                                                                      |
| `alignment`   | `"start" \| "middle" \| "end" \| "baseline"` | `"baseline"` | Alignment along the off-axis                                                                                                                                                                                                                                                                         |
| `mode`        | `"edge" \| "center"`                         | `"edge"`     | Whether `spacing` is measured edge-to-edge or center-to-center                                                                                                                                                                                                                                       |
| `reverse`     | `boolean`                                    | `false`      | Reverse children order along `dir`                                                                                                                                                                                                                                                                   |
| `sharedScale` | `boolean`                                    | `false`      | Share scale across all children                                                                                                                                                                                                                                                                      |
| `glue`        | `boolean`                                    | `false`      | Glue children together: collapse data-driven sizes into a single positional axis at this level (the underlying-space kind becomes POSITION). [`stack`](./stack) sets this.                                                                                                                           |
| `normalize`   | `boolean`                                    | `false`      | Space-filling spine: make the layout axis fill the extent in proportion to child size (the mosaic/marimekko conditional axis). Pure layout — data is not mutated, so a cross-axis `w`/`h` size still reads the raw marginal sum. See [Space-filling spines](#space-filling-spines-mosaic-marimekko). |
| `w`, `h`      | `number \| string`                           | —            | Fixed dimension, or field name to encode size from data                                                                                                                                                                                                                                              |

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

`by` accepts a **field name**, a **lodash path string**, or a **function**:

```ts
spread({ by: "species", dir: "x" }); // field on a raw record
spread({ by: "datum.species", dir: "x" }); // path (e.g. after a selection)
spread({ by: (r) => r.datum.species, dir: "x" }); // function escape hatch
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
  .mark(area({ opacity: 0.8 })); // channel → raw record, no prefix
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

## Space-filling spines (mosaic / marimekko)

`normalize: true` turns a stack into a **space-filling spine**: its segments
fill the whole extent in proportion to their size, so the axis reads as a local
0–100% conditional distribution. It is pure layout — the data is never mutated,
so the same field can drive both a cross-axis marginal size and the normalized
fill.

That is exactly a mosaic. Nest two stacks on alternating axes: the outer sizes
each column by its raw total (`w: "count"` — the marginal), the inner
`normalize`s to fill each column's height by share (the conditional). Both come
off one raw field — no per-cell aggregation or precomputed totals:

```ts
chart(passengers, { axes: true })
  .flow(
    // columns by class — width ∝ each class's count (marginal)
    stack({ by: "pclass", dir: "x" }),
    // survival share within each column (conditional), filling height
    stack({ by: "survived", dir: "y", w: "count", normalize: true })
  )
  .mark(rect({ h: "count", fill: "survived" }))
  .render(container, { w: 400, h: 300 });
```

::: gofish example:titanic-survival-mosaic hidden
:::

`normalize` composes to any depth: a third alternating level gives a nested
mosaic (`class → sex → survived`). Because each level's stacking axis is a local
scope and the count is read raw everywhere, the marginal × conditional × … area
factorization holds all the way down.

::: warning
Inner conditional axes are local scopes, so they don't yet render 0–1 tick
labels — only the outermost marginal axis is labeled.
:::
