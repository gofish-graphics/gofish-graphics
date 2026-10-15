---
order: 50
---

# group

Partitions data by a field and wraps each partition's mark in a frame. Useful when you want a per-group enclosure that you can then style or reference, without imposing any spread/stack layout.

## Signature

```ts
group({ by });
```

## Parameters

::: gofish-ref group
:::

## Example

```ts
// One frame per species, with the per-species mark inside.
.flow(group({ by: "species" }))
.mark(ribbon({ opacity: 0.7 }))
```

For the simple case — one ribbon or stream band per group, re-partitioning the
marks a chart already drew — reach for a bare `.layer(ribbon(...))` instead,
with no `by` at all: a ribbon or line fused over a chart's own flow splits at
the flow's own grouping by default (see [`ribbon`'s Default
grouping](/js/api/marks/ribbon#default-grouping)). `group()` is for nested
splits (composing with a connector's own `by`, or an explicit `by` override)
and for operator pipelines generally — anywhere you need a named per-partition
frame without a connector mark driving the partitioning. `group`'s own `by` reads
[`ref`](/js/api/marks/ref)s when it runs after a
[`selectAll`](/js/api/selection/ref), and a ref is read through its rows, so the
bare field name works — `by: "species"`:

```ts
chart(selectAll("bars"))
  .flow(group({ by: "species" }))
  .mark(ribbon({ opacity: 0.8 }));
```

On a ref, a field resolves to a scalar only when every row in the ref's bag
agrees on that field (homogeneity collapse); otherwise it is `undefined`. See
[`spread` → path-aware `by`](/js/api/operators/spread#path-aware-by) for the full
explanation.

For most cases you'll want [`spread`](/js/api/operators/spread) or [`stack`](/js/api/operators/stack) instead — they group **and** lay out. Reach for `group` when you need named per-partition frames (e.g. for `selectAll` or constraints) but don't want the children placed.
