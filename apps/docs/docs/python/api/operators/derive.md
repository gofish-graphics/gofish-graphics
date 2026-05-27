# derive

Transforms the data mid-pipeline with an arbitrary **Python function**. This is
the Python API's most powerful operator — your function runs in your kernel,
with the full power of pandas, NumPy, or plain Python.

::: starfish example:mosaic-plot hidden
:::

```python
from gofish import chart, spread, derive, stack, rect, normalize

chart(data).flow(
    spread(by="origin", dir="x"),
    derive(lambda d: normalize(d, "count")),
    stack(by="cylinders", dir="y"),
).mark(rect(h="count", fill="origin", stroke="white", strokeWidth=2)).render(
    w=500, h=300, axes=True
)
```

## Signature

```python
derive(fn) -> DeriveOperator
```

## Parameters

| Parameter | Type       | Description                                                    |
| --------- | ---------- | -------------------------------------------------------------- |
| `fn`      | `callable` | A function that receives the current data and returns new data |

Returns a `DeriveOperator` for use inside [`.flow()`](/python/api/core/flow).

## How it works

When the chart renders, the engine calls back into your Python kernel for each
`derive` step: it sends the current group's data to Python, runs `fn`, and uses
the returned data for the rest of the pipeline. The function can return a list
of dicts or a pandas `DataFrame`.

```python
# Keep only large catches
chart(seafood).flow(
    spread(by="lake", dir="x"),
    derive(lambda rows: [r for r in rows if r["count"] > 20]),
).mark(rect(h="count"))
```

## Utility functions

GoFish ships small helpers that pair well with `derive`:

- `normalize(data, field)` — scale `field` so the values sum to 1.
- `repeat(row, field)` — repeat a row `row[field]` times.

```python
from gofish import derive, normalize

derive(lambda d: normalize(d, "count"))
```

## Notes

- `derive` runs in your kernel — anything importable in your notebook is fair
  game.
- Because it round-trips to Python, a `derive` step is a callback, not a static
  transform; it re-runs whenever the chart re-renders.
