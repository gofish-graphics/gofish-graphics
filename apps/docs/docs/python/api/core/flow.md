# flow

Applies a pipeline of **operators** to the chart's data. Operators partition,
position, and transform the data before the [mark](/python/api/core/mark) draws
it.

::: gofish example:stacked-bar-chart hidden
:::

```python
from gofish import chart, spread, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species")).render(w=500, h=300)
```

## Signature

```python
ChartBuilder.flow(*operators) -> ChartBuilder
```

## Parameters

| Parameter    | Type                   | Description                                                         |
| ------------ | ---------------------- | ------------------------------------------------------------------- |
| `*operators` | `Operator \| Composed` | One or more operators or `compose` fragments, applied left to right |

Returns a new `ChartBuilder` with the operators appended.

## How it works

Operators run in order. Each one receives the data (or groups) produced by the
previous one. In the example above:

1. `spread(by="lake", dir="x")` splits the rows into one group per lake and
   places the groups across the x axis.
2. `stack(by="species", dir="y")` stacks each lake's rows by species along y.

The [mark](/python/api/core/mark) then draws every leaf row.

## Reusable flow fragments

Use `compose` to package a sequence of operators as one reusable fragment. The
operators keep the same left-to-right order they have in `.flow()`:

```python
from gofish import chart, compose, derive, rect, repeat, spread

def waffle(count, row_size):
    return compose(
        derive(lambda rows: [u for row in rows for u in repeat(row, count)]),
        derive(lambda rows: [rows[i : i + row_size] for i in range(0, len(rows), row_size)]),
        spread(spacing=2, dir="y", reverse=True),
        spread(spacing=2, dir="x"),
    )

chart(seafood).flow(
    spread(by="lake", spacing=8, dir="x", alignment="end"),
    waffle("count", 5),
).mark(rect(w=8, h=8, fill="species")).render()
```

Fragments may be nested. `compose()` with no arguments adds no operators. When
a fragment is passed to `.flow()`, GoFish expands it into its constituent
operators, so a composed flow behaves exactly like the same operators written
out one by one.

## Available operators

| Operator                                 | Purpose                                   |
| ---------------------------------------- | ----------------------------------------- |
| [spread](/python/api/operators/spread)   | Lay groups out along an axis, with gaps   |
| [stack](/python/api/operators/stack)     | Stack groups edge-to-edge along an axis   |
| [table](/python/api/operators/table)     | Lay groups out in a 2D grid               |
| [scatter](/python/api/operators/scatter) | Position groups by x/y fields             |
| [group](/python/api/operators/group)     | Wrap each partition in a frame            |
| [derive](/python/api/operators/derive)   | Transform the data with a Python function |
| [log](/python/api/operators/log)         | Print the data for debugging              |

## Notes

- `flow()` can be called multiple times; operators accumulate.
- A chart with no `flow()` draws a single mark over the whole dataset.
