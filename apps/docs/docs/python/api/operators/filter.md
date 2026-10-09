---
order: 135
---

# filter

Keeps the rows a predicate accepts, and drops the rest. It sits in `.flow()`
beside [`derive`](/python/api/operators/derive), which can do the same thing
with an arbitrary function — `filter` just says what it does.

```python
from gofish import chart, circle, field, filter, scatter

chart(penguins, axes=True).flow(
    filter(field("Body Mass (g)").between(3500, 4500, closed="left")),
    scatter(x="Flipper Length (mm)", y="Beak Length (mm)"),
).mark(circle(r=3, fill="Species"))
```

## Signature

```python
filter(predicate) -> Operator
```

## Parameters

`predicate` is a field predicate or a Python function of one row.

A field predicate comes from
[`field(name).between(lo, hi, closed=None)`](/python/api/operators/spread#field-expression-pipeline).
Its bounds are plain numbers, and it raises if the expression carries pipeline
ops (`field("x").bin(step=10).between(...)`), which would otherwise test the raw
field: a predicate is not a value slot. It is data, so it crosses to JavaScript
as these fields:

::: gofish-ref filter
:::

A function, such as `lambda row: row["year"] == 2020`, runs in your kernel. The
filter is then a [`derive`](/python/api/operators/derive), so the chart calls
back into Python every time it renders.

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## Examples

```python
# A value window, with polars' `closed` ends
.flow(filter(field("day").between(100, 120, closed="right")))

# A plain predicate
.flow(filter(lambda row: row["year"] == 2020), spread(by="category", dir="x"))
```

## Domains are inferred from what survives

`filter` runs **before** domain inference, so the scales see only the rows it
kept. To hold a scale to the full data, give the chart an explicit domain.
