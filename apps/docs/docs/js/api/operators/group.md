# group

Partitions data by a field and wraps each partition's mark in a frame. Useful when you want a per-group enclosure that you can then style or reference, without imposing any spread/stack layout.

## Signature

```ts
group({ by });
```

## Parameters

| Option | Type                         | Description                                                        |
| ------ | ---------------------------- | ------------------------------------------------------------------ |
| `by`   | `string \| (item) => string` | **Required.** Field, lodash path, or accessor function to group by |

## Example

```ts
// One frame per species, with the per-species mark inside.
.flow(group({ by: "species" }))
.mark(area({ opacity: 0.7 }))
```

`group` is most often reached for right after a
[`selectAll`](/js/api/selection/ref), to re-partition selected nodes for a
ribbon or stream chart. The stream is then [`ref`](/js/api/marks/ref)s, so use
the **datum path** — `by: "datum.species"`:

```ts
Chart(selectAll("bars"))
  .flow(group({ by: "datum.species" }))
  .mark(area({ opacity: 0.8 }));
```

A `datum.field` path resolves to a scalar only when every row in the ref's bag
agrees on that field (homogeneity collapse); otherwise it is `undefined`. `by`
also accepts a function escape hatch (`by: (r) => r.datum.species`). See
[`spread` → path-aware `by`](/js/api/operators/spread#path-aware-by) for the full
explanation, including why `by` is path-prefixed but mark channels (e.g.
`rect({ h: "count" })`) are not.

For most cases you'll want [`spread`](/js/api/operators/spread) or [`stack`](/js/api/operators/stack) instead — they group **and** lay out. Reach for `group` when you need named per-partition frames (e.g. for `selectAll` or constraints) but don't want the children placed.
