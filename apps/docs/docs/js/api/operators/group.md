---
order: 50
---

# group

Partitions data by a field and draws each partition's mark in one [`layer`](/js/api/operators/layer), which places nothing. Useful when you want a per-group enclosure that you can then style or reference, without imposing any spread/stack layout. It takes the layer's options, so a `coord` draws the groups in that coordinate space.

## Signature

```ts
group({ by, coord?, axes?, padding?, x?, y?, w?, h? });
```

## Parameters

::: gofish-ref group
:::

## Example

```ts
// One group per species, with the per-species mark inside.
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
group without a connector mark driving the partitioning. `group`'s own `by` reads
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

## Coordinate space

With a `coord`, the layer the groups are drawn in is that coordinate space, as
[`layer({ coord })`](/js/api/operators/layer#coordinate-space) is. After a
`spread`, a `group` with a `coord` gives each cell its own space: here, one pie
per lake.

::: gofish example:small-multiple-pie-charts
:::

For most cases you'll want [`spread`](/js/api/operators/spread) or [`stack`](/js/api/operators/stack) instead — they group **and** lay out. Reach for `group` when you need named per-partition groups (e.g. for `selectAll` or constraints) but don't want the children placed.
