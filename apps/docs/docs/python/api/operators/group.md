# group

Partitions the data by a field and wraps each partition in its own frame,
without positioning the frames. Pair it with another operator — or a nested
mark — to lay the groups out.

::: starfish example:grouped-bar-chart hidden
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

| Parameter | Type  | Description                           |
| --------- | ----- | ------------------------------------- |
| `by`      | `str` | **Required.** Field name to group by. |

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
