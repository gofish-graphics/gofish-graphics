# group

Partitions the data by a field and wraps each partition in its own frame,
without positioning the frames. Pair it with another operator — or a nested
mark — to lay the groups out.

::: gofish example:grouped-bar-chart hidden
:::

```python
from gofish import chart, spread, group, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    group(by="species"),
).mark(rect(h="count", fill="species")).render(w=400, h=300)
```

## Signature

```python
group(*, by, **options) -> Operator
```

## Parameters

| Parameter | Type                                | Description                                                                                                                                 |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`      | `str` \| `field(...)` \| `Callable` | **Required.** Field, dotted path, [`field(...)`](/python/api/operators/spread#field-expression-pipeline) accessor, or callable to group by. |

For the simple case — one ribbon or stream band per group, re-partitioning the
marks a chart already drew — reach for a bare `.layer(ribbon(...))` instead,
with no `by` at all: a ribbon or line fused over a chart's own flow splits at
the flow's own grouping by default (see [`ribbon`'s Default
grouping](/python/api/marks/ribbon#default-grouping)). `group()` is for nested
splits (composing with a connector's own `by`, or an explicit `by` override)
and for operator pipelines generally — anywhere you need a named per-partition
frame without a connector mark driving the partitioning. `group`'s own `by` reads
when it runs after a `selectAll` use the datum path — `by="datum.species"`:

```python
chart(selectAll("bars")) \
    .flow(group(by="datum.species")) \
    .mark(ribbon(opacity=0.8))
```

A `datum.field` path resolves to a scalar only when every row in the ref's bag
agrees on that field (homogeneity collapse); otherwise it is `None`. `by` also
accepts a callable escape hatch (`by=lambda r: r.datum.species`). See
[`spread` → path-aware `by`](/python/api/operators/spread#path-aware-by) for the
full explanation, including why `by` is path-prefixed but mark channels (e.g.
`rect(h="count")`) are not.

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## How it works

`group` only **partitions** — it draws each partition's contents in a shared
frame but does not move the frames apart. Use it when a later operator (or the
mark itself) is responsible for layout, or when you need the grouping boundary
for scales and color.

## Notes

- For most charts, [`spread`](/python/api/operators/spread) or
  [`stack`](/python/api/operators/stack) — which partition **and** position — are
  what you want. Reach for `group` when you need the partition without the
  layout.
- `by` is required.
