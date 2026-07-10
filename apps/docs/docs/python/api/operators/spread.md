# spread

Partitions the data and lays the groups out along an axis, with a gap between
them. The workhorse operator for bar charts and small multiples.

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count")).render(
    w=500, h=300, axes=True
)
```

## Signature

```python
spread(*, by=None, dir, **options) -> Operator
```

## Parameters

| Parameter   | Type                                     | Description                                                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `by`        | `str` \| `field(...)` \| `Callable`      | Field, dotted path, [`field(...)`](#field-expression-pipeline) accessor, or callable to partition by (see [path-aware `by`](#path-aware-by)). Omit to spread per row.                                                                                                                                        |
| `dir`       | `"x"` \| `"y"`                           | **Required.** Axis to lay groups out along.                                                                                                                                                                                                                                                                  |
| `spacing`   | `int`                                    | Gap between groups in pixels. Ignored when `glue=True`.                                                                                                                                                                                                                                                      |
| `alignment` | `str`                                    | Cross-axis alignment of the groups.                                                                                                                                                                                                                                                                          |
| `glue`      | `bool`                                   | Glue children together: collapse data-driven sizes into a single positional axis at this level. [`stack`](/python/api/operators/stack) sets this.                                                                                                                                                            |
| `w`, `h`    | `int` \| `str`                           | Fixed pixel size, or a field name sizing this operator's own box from data (data-driven operator extent — e.g. a mosaic's column width).                                                                                                                                                                     |
| `size`      | `int` \| `str` \| `field(...)` \| `list` | Per-entry stack-axis extent — a field name, a [`field(...)`](#field-expression-pipeline) accessor, or an explicit list with one value per split entry. `size=field("count").normalize()` makes the stack axis a **space-filling spine**. See [Space-filling spines](#space-filling-spines-mosaic-marimekko). |
| `label`     | `bool`                                   | Whether to emit an axis label for the partition field.                                                                                                                                                                                                                                                       |

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## Examples

```python
# One bar per lake
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))

# Wider gaps
chart(seafood).flow(spread(by="lake", dir="x", spacing=64)).mark(rect(h="count"))

# Nest spreads for grouped layouts
chart(seafood).flow(
    spread(by="lake", dir="x"),
    spread(by="species", dir="x", spacing=2),
).mark(rect(h="count", fill="species"))
```

## Path-aware `by` {#path-aware-by}

`by` accepts a **field name**, a **dotted path string**, a **callable**, or a
[`field(...)`](#field-expression-pipeline) accessor:

```python
spread(by="species", dir="x")            # field on a raw record
spread(by="datum.species", dir="x")      # path (e.g. after a selection)
spread(by=lambda r: r.datum.species, dir="x")  # callable escape hatch
spread(by=field("species").sort(), dir="x")    # field(...) accessor
```

Path strings matter after a `ref` / `selectAll` selection: the stream items are then
**refs**, not raw records, so you re-encode by the datum path —
`by="datum.species"`.

### How a `datum.field` path resolves (homogeneity collapse) {#homogeneity-collapse}

A ref's `.datum` is the **raw bag of rows** that flowed into the node (a list; a
fully-split leaf is a 1-row list). A `by="datum.field"` path does **not** just
read the field off the first row — it **projects with homogeneity collapse**:

> `datum.field` resolves to a scalar **iff every row in the node's bag agrees on
> that field**; otherwise it is `None` — the "this field is multi-valued here,
> grouping by it is ill-posed" signal.

This is exactly SQL's `ONLY_FULL_GROUP_BY` / functional-dependency rule: you may
only group by a column that is constant within each row-bag.

**Example.** After `selectAll("bars")` where each ref is a _lake_ aggregate of 5
species rows:

```python
group(by="datum.lake")     # resolves — all 5 rows share one lake
group(by="datum.species")  # None — 5 distinct species; ill-posed
```

To group by a field that is multi-valued in the current bag, **disaggregate
first** (split the bag so each child is homogeneous in that field). A fully-split
cell (1 row) trivially collapses, so `by="datum.species"` works once each node
holds a single record.

### `by` vs. channel: an intentional asymmetry

`by` operates on the **selection stream**, but a mark's channels operate on the
**raw record** — and they are addressed differently:

| Place                                 | Reads          | How to write `species`   |
| ------------------------------------- | -------------- | ------------------------ |
| `by` on an operator after a selection | the ref stream | `"datum.species"` (path) |
| a channel on a mark, e.g. `rect(...)` | the raw record | `"species"` (bare field) |

So a ribbon chart reads:

```python
chart(selectAll("bars")) \
    .flow(group(by="datum.species")) \
    .mark(ribbon(opacity=0.8))         # channel → raw record, no prefix
```

Do **not** "consistency-refactor" channels into `datum.count` — a channel like
`rect(h="count")` reads the bound record directly and is never path-prefixed.
Only `by` (on `group`/`spread`/`stack`/`scatter`) is path-aware, because only
`by` sees the selection stream.

## Field-expression pipeline {#field-expression-pipeline}

`field(name)` returns a chainable accessor — a builder where each method
appends one op to an ordered pipeline. It works in two disjoint places:

- As `by` (a **domain** slot): `.sort(by=None, order=None)`, `.sort(values)`
  (an explicit order list), `.reverse()`, and `.bin(thresholds=None)` decide
  **which groups exist and in what order**.
- As a mark or `size` channel value (a **value** slot): `.sum()`, `.mean()`,
  `.count()`, and `.distinct()` **fold a group's rows to one number**,
  overriding the channel's own default aggregation (sum for size, mean for
  position).

Mixing the two — an aggregate op on `by`, or a domain op on a value channel —
raises.

**Sort a stack's groups by another field's total**, instead of data order:

```python
# Bars ordered ascending by their own total `value`
chart(data).flow(
    spread(by=field("category").sort("value"), dir="x")
).mark(rect(h="value"))
```

Omit the `by` argument to sort by the group key itself; pass
`order="desc"` for descending.

**Sort groups by an explicit order**, for a domain-specific sequence no
aggregate expresses (severity, calendar order, a fixed ranking):

```python
# Weather categories in a fixed order, not alphabetical or by aggregate
chart(data).flow(
    stack(by=field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"]), dir="y")
)
```

Groups whose key isn't in the list are appended after, in natural sort
order.

**Bin a numeric field into groups** — a histogram, with no precomputed bins:

```python
# One bar per ~10 auto-computed bins of `age`, height = row count per bin
chart(data).flow(
    spread(by=field("age").bin(), dir="x")
).mark(rect(h=field("age").count()))
```

Empty bins are dropped, like an ordinary group-by. Pass
`field("age").bin(5)` (a count) or explicit thresholds (a list) to control
the binning.

**Override a channel's default aggregation:**

```python
# The bar height is each species' MEAN weight, not the sum
chart(data).flow(
    spread(by="species", dir="x")
).mark(rect(h=field("weight").mean()))
```

`.count()` and `.distinct()` report measure `"count"` (they're counts, not the
source field's own units) unless you annotate the accessor explicitly:
`field("id", measure="my-measure").distinct()`.

## Space-filling spines (mosaic / marimekko) {#space-filling-spines-mosaic-marimekko}

`size=field(<name>).normalize()` turns a stack's entries into a
**space-filling spine**: each entry's size becomes its SHARE of the window
(the operator's own split entries, `v_e / Σv_e`), so the axis reads as a local
0–100% conditional distribution. It replaces the removed `normalize=True`
layout flag — `.normalize()` is a **data** transform on the `size` channel (a
windowed share, computed once up front), not a layout mode, so the same field
can drive both a cross-axis marginal size and the normalized fill with no
preprocessing.

Nest two stacks on alternating axes for a mosaic: the outer sizes each column
by its raw total (`size="count"` — the marginal), the inner `size`s by each
entry's share (the conditional):

```python
(
    chart(passengers, axes=True)
    .flow(
        # columns by class — width ∝ each class's count (marginal)
        stack(by="pclass", dir="x", size="count"),
        # survival share within each column (conditional), filling height
        stack(by="survived", dir="y", size=field("count").normalize()),
    )
    .mark(rect(fill="survived", stroke="white", strokeWidth=1))
    .render(w=400, h=300)
)
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

## Notes

- `dir` is required — `spread()` raises a `ValueError` without it.
- Use [`stack`](/python/api/operators/stack) when you want groups touching
  edge-to-edge with no gap.
- Data order determines group order; sort your data first if order matters.
