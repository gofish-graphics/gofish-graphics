---
title: partition
order: 68
---

# partition

Divides the space along an axis into the cells of a binned key, one group per
cell. Each group is placed across its cell's interval on one continuous scale,
so a cell's width follows its width in data: a 29-day February is narrower than
a 31-day March. An empty cell keeps its place.

::: gofish example:monthly-sales-on-a-time-axis hidden
:::

```python
from gofish import Calendar, Schema, chart, field, partition, rect

chart(daily, schema={"date": Schema.time()}, axes=True).flow(
    partition(by=field("date").bin(Calendar.month), dir="x")
).mark(rect(h=field("value").sum(), inset=1)).render(w=560, h=200)
```

## Signature

```python
partition(*, by, dir, **options) -> Operator
```

`partition` has only the operator form, used inside
[`.flow()`](/python/api/core/flow). Its children are the groups of its key, so
there is no list of children to pass it.

## Parameters

::: gofish-ref partition
:::

## The key must have a region

`by` must be a key whose values have a region. Today that is a binned field,
`field(x).bin(...)`, whose values are cells. Each cell is an interval
`[start, end)`.

```python
partition(by=field("date").bin(Calendar.month), dir="x")  # true month widths
partition(by=field("rating").bin(step=0.5), dir="x")  # a histogram
```

A plain field has no region, so `partition(by="date", dir="x")` raises a
`ValueError`. To give each value an equal slot instead, use
[`spread`](./spread) with the same key.

## Filling the cell

A mark with no size along `dir` fills its cell. [`rect`](/python/api/marks/rect)
is the mark for this. Its `inset` option draws it in from the edges of the
cell by a number of pixels, so neighboring bars are drawn apart.

An operator after `partition` divides the cell it is given. A
[`stack`](./stack) fills the cell's width, and a [`spread`](./spread) fits its
groups inside the cell, so February's group is narrower than March's.

::: gofish example:grouped-monthly-sales-on-a-time-axis hidden
:::

```python
chart(daily, schema={"date": Schema.time()}, axes=True).flow(
    partition(by=field("date").bin(Calendar.month), dir="x"),
    spread(by="region", dir="x"),
).mark(rect(h=field("value").sum(), fill="region"))
```

## Axis

The axis along `dir` is continuous. A binned time column gives a time axis
whose inner row is the cells' own partition, with each label centered under
its cell, and an outer row of the parent level (years under months). A binned
number column gives a numeric axis. See
[Underlying Space](/internals/core/underlying-space#partition-each-group-across-its-cell)
for how the layout and the axis read the cells.
