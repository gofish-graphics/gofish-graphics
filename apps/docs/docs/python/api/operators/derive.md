# derive

Transforms the data mid-pipeline with an arbitrary **Python function**. This is
the Python API's most powerful operator — your function runs in your kernel,
with the full power of pandas, NumPy, or plain Python.

::: gofish example:mosaic-chart hidden
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

## Measures: keeping units across a transform

A channel that encodes a field carries that field's **measure** — its
unit-of-measure, like `"Beak Depth (mm)"` or `"count"`. GoFish uses measures to
decide when two axes may share a scale: overlaying or aligning marks whose axes
have the _same_ measure merges their domains, while mixing _different_ measures
(say, a count axis with a millimeter axis) is refused with an error rather than
silently corrupting the shared domain.

By default the measure is just the field name, which is usually right. Because
`derive` round-trips through your kernel, a transform's unit provenance does
**not** survive the bridge — once `bin()` (or your own lambda) returns new
columns, GoFish only knows their names, not their units. When a derived column
is really in some existing unit and its axis should share with that unit's
axis, annotate the channel with `field(name, measure=...)`:

```python
from gofish import bin, chart, derive, field, rect, scatter

# bin edges are still beak-length millimeters, not "start"/"end" units:
chart(penguins, h=80).flow(
    derive(bin("Beak Length (mm)")),
    scatter(
        xMin=field("start", measure="Beak Length (mm)"),
        xMax=field("end", measure="Beak Length (mm)"),
    ),
).mark(rect(h="count"))
```

`datum(v)` values can carry a measure the same way on the JS side.

If you hit **"Cannot unify underlying spaces with different measures"**, you
have two remedies:

1. If the units really are the same, say so with `field(name, measure=...)` so
   the axes collapse to one measure and merge.
2. If the units really differ, give the inner chart an explicit `w`/`h`
   (`chart(data, h=80)`) so it becomes a self-contained scale region and never
   shares that axis.

An annotation that contradicts known provenance is itself an error — measures
are type claims, and two contradictory claims fail fast at the channel.
