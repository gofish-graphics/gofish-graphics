# spread

Partitions the data and lays the groups out along an axis, with a gap between
them. The workhorse operator for bar charts and small multiples.

::: starfish example:bar-chart hidden
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

| Parameter   | Type                | Description                                                                                                      |
| ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `by`        | `str` \| `Callable` | Field, dotted path, or callable to partition by (see [path-aware `by`](#path-aware-by)). Omit to spread per row. |
| `dir`       | `"x"` \| `"y"`      | **Required.** Axis to lay groups out along.                                                                      |
| `spacing`   | `int`               | Gap between groups in pixels.                                                                                    |
| `alignment` | `str`               | Cross-axis alignment of the groups.                                                                              |
| `label`     | `bool`              | Whether to emit an axis label for the partition field.                                                           |

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

`by` accepts a **field name**, a **dotted path string**, or a **callable**:

```python
spread(by="species", dir="x")            # field on a raw record
spread(by="datum.species", dir="x")      # path (e.g. after a selection)
spread(by=lambda r: r.datum.species, dir="x")  # callable escape hatch
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
    .mark(area(opacity=0.8))         # channel → raw record, no prefix
```

Do **not** "consistency-refactor" channels into `datum.count` — a channel like
`rect(h="count")` reads the bound record directly and is never path-prefixed.
Only `by` (on `group`/`spread`/`stack`/`scatter`) is path-aware, because only
`by` sees the selection stream.

## Notes

- `dir` is required — `spread()` raises a `ValueError` without it.
- Use [`stack`](/python/api/operators/stack) when you want groups touching
  edge-to-edge with no gap.
- Data order determines group order; sort your data first if order matters.
