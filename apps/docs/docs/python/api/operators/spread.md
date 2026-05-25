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

| Parameter   | Type           | Description                                            |
| ----------- | -------------- | ------------------------------------------------------ |
| `by`        | `str`          | Field name to partition by. Omit to spread per row.    |
| `dir`       | `"x"` \| `"y"` | **Required.** Axis to lay groups out along.            |
| `spacing`   | `int`          | Gap between groups in pixels.                          |
| `alignment` | `str`          | Cross-axis alignment of the groups.                    |
| `label`     | `bool`         | Whether to emit an axis label for the partition field. |

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

## Notes

- `dir` is required — `spread()` raises a `ValueError` without it.
- Use [`stack`](/python/api/operators/stack) when you want groups touching
  edge-to-edge with no gap.
- Data order determines group order; sort your data first if order matters.
