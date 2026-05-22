# group

Partitions data by a field and wraps each partition's mark in a frame. Useful when you want a per-group enclosure that you can then style or reference, without imposing any spread/stack layout.

## Signature

```ts
group({ by });
```

## Parameters

| Option | Type     | Description                     |
| ------ | -------- | ------------------------------- |
| `by`   | `string` | **Required.** Field to group by |

## Example

```ts
// One frame per species, with the per-species mark inside.
.flow(group({ by: "species" }))
.mark(area({ opacity: 0.7 }))
```

For most cases you'll want [`spread`](/js/api/operators/spread) or [`stack`](/js/api/operators/stack) instead — they group **and** lay out. Reach for `group` when you need named per-partition frames (e.g. for `select` or constraints) but don't want the children placed.
