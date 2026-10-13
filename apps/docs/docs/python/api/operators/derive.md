---
order: 130
---

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
).mark(rect(h="count", fill="origin", stroke="white", stroke_width=2)).render(
    w=500, h=300, axes=True
)
```

## Signature

```python
derive(fn) -> DeriveOperator
derive(fn, schema={...}) -> DeriveOperator
```

## Parameters

`fn` (required, `Callable`) receives the current group's rows and returns the
new ones: a list of dicts, `None`, or a dataframe from any backend
[narwhals](https://narwhals-dev.github.io/narwhals/) supports. It returns a
list even for one row (`lambda d: [d[0]]`); a bare dict is not data. The
options:

::: gofish-ref derive
:::

`schema` takes the same column types as [`chart`'s `schema`](/python/api/core/schema).

Returns a `DeriveOperator` for use inside [`.flow()`](/python/api/core/flow).

## Column types of the result

Each column of the returned rows is typed like chart data:

- A column whose values still fit the type it had in the input keeps that
  type. A time column of unchanged instants stays a time, and an ordered
  column whose values are still text or numbers keeps the order, so a
  value outside its levels is an error where the order is used.
- A datetime column is a time.
- Any other column has no type. A `derive` that rewrites a date to `"Mar"`
  makes the column plain text.
- A `schema` entry overrides these for its column and converts the values
  as a chart's schema does: an ISO 8601 string in a `Schema.time()` column
  becomes an instant.

Fitting reads the values, not what they mean: a `derive` that turns a time
column into plain numbers, such as years, keeps the time type, because any
number is a valid instant
([#1089](https://github.com/gofish-graphics/gofish-graphics/issues/1089)).
Give the column its type with `derive(fn, schema={...})`.

```python
# Monthly highs, months in calendar order
derive(monthly_highs, schema={"month": Schema.ordered(MONTHS)})
```

## How it works

When the chart renders, the engine calls back into your Python kernel for each
`derive` step: it sends the current group's data to Python, runs `fn`, and uses
the returned data for the rest of the pipeline. The function can return a list
of dicts, `None`, or a dataframe from any backend
[narwhals](https://narwhals-dev.github.io/narwhals/) supports (pandas, polars,
pyarrow, ...).

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

## Units: keeping axes shared across a transform

A channel that encodes a column carries the column's **unit**. GoFish uses
units to decide when two axes may share a scale. A column with no declared
unit has an unknown unit, which shares an axis with any column, so the
columns a `derive` computes (`lo`, `hi`, a box plot's quartiles) share an
axis with no annotation. Two different declared units on one axis are an
error. See [`Schema.unit`](/python/api/core/schema).

A built-in transform like `bin()` types its output columns: the bin edges
`start`/`end` are amounts of the source column, not of the columns "start"
and "end", so they title their axis as the source does and share its unit.
Those types travel in the operator's IR across the bridge:

```python
from gofish import bin, chart, derive, rect, scatter

# The x axis is titled "Beak Length (mm)", with no annotation:
chart(penguins, h=80).flow(
    derive(bin("Beak Length (mm)")),
    scatter(x_min="start", x_max="end"),
).mark(rect(h="count"))
```

Your **own** `derive` lambda can declare the unit of a column it makes with
its `schema`:

```python
from gofish import Schema, derive

derive(quartiles, schema={"lo": Schema.unit("USD"), "hi": Schema.unit("USD")})
```

An axis is titled by the quantities of its columns (each column's name,
unless its schema declares a quantity), then a declared unit in parentheses:
`"Pay (USD)"`. See [`Schema.quantity`](/python/api/core/schema).

If an axis combines two different units, you have two remedies:

1. If the units really are the same, declare the same unit for both columns.
2. If the units really differ, give the inner chart an explicit `w`/`h`
   (`chart(data, h=80)`) so it becomes a self-contained scale region and never
   shares that axis.
