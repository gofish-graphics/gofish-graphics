# stack

Stacks groups edge-to-edge along an axis with no gap between them — `spread`
without the spacing. The basis for stacked bar charts and pie charts.

::: starfish example:stacked-bar-chart hidden
:::

```python
from gofish import chart, spread, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y", label=False),
).mark(rect(h="count", fill="species")).render(w=500, h=300)
```

## Signature

```python
stack(children=None, *, by=None, dir, **options) -> Operator | Mark
```

Like [`spread`](/python/api/operators/spread), `stack` is polymorphic: called
with no positional argument it returns an **operator** for use inside
[`.flow()`](/python/api/core/flow); called with a positional list of marks it
returns a **combinator-form mark** that stacks those explicit children (the
low-level form behind the v1 `stackX`/`stackY` operators).

## Parameters

| Parameter   | Type                | Description                                                                                                                                                                                               |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`        | `str` \| `Callable` | Field, dotted path, or callable to partition by. Omit to stack per row. Path-aware (use `"datum.field"` after a selection); see [`spread` → path-aware `by`](/python/api/operators/spread#path-aware-by). |
| `dir`       | `"x"` \| `"y"`      | **Required.** Axis to stack along.                                                                                                                                                                        |
| `alignment` | `str`               | Cross-axis alignment of the stacked groups.                                                                                                                                                               |
| `label`     | `bool`              | Whether to emit an axis label for the partition field.                                                                                                                                                    |

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## Examples

```python
# Stacked bars: lakes across x, species stacked up y
chart(seafood).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species"))

# Grouped bars: stack along x instead
chart(seafood).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="x"),
).mark(rect(h="count", fill="species"))
```

## Notes

- `dir` is required — `stack()` raises a `ValueError` without it.
- Combine with `coord=clock()` on [`chart`](/python/api/core/chart) to turn a
  stack into a pie chart.
- Use [`spread`](/python/api/operators/spread) when you want gaps between groups.
