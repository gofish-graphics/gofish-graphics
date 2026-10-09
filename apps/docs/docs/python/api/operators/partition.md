---
title: partition
order: 68
---

# partition

Divides the space into the cells of a binned key, one group per cell, and gives
each group its cell. Each cell sits at its true place on one continuous scale,
so a cell's width follows its width in data: a 29-day February is narrower than
a 31-day March. An empty cell keeps its place. With one key per axis, it
divides both axes into rectangles.

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
partition(*, by, dir=None, **options) -> Operator
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
cell by a number of pixels, so neighboring bars are drawn apart. A mark with a
size of its own along `dir`, such as a [`circle`](/python/api/marks/circle) or
a [`text`](/python/api/marks/text), keeps its size and is centered in the
cell.

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

## Both axes

With `by` a dict keyed by axis, `partition` divides both axes. Each key must
have a region, and `dir` and `alignment` are not allowed.

```python
partition(by={"x": field("a").bin(step=1), "y": field("b").bin(step=0.5)})
```

It is the same as the 1D partition on x, then the 1D partition on y with
`alignment="middle"`:

```python
partition(by=field("a").bin(step=1), dir="x"),
partition(by=field("b").bin(step=0.5), dir="y", alignment="middle")
```

Each group gets a rectangle: its x cell by its y cell. A
[`region`](/python/api/marks/region) fills it, so a 2D histogram is a `region`
whose `fill` is a count.

::: gofish example:2d-histogram-of-movie-ratings hidden
:::

```python
from gofish import Color, chart, field, partition, region

chart(movies, color=Color.gradient("blues"), axes=True).flow(
    partition(
        by={
            "x": field("IMDB Rating").bin(step=0.5),
            "y": field("Rotten Tomatoes Rating").bin(step=5),
        }
    )
).mark(region(fill=field("IMDB Rating").count())).render(w=480, h=320)
```

A mark with a size of its own is centered in its rectangle.

::: gofish example:penguin-counts-by-flipper-length-and-body-mass hidden
:::

```python
from gofish import chart, field, partition, text

# measured: the penguins that have both a flipper length and a body mass
chart(measured, axes=True).flow(
    partition(
        by={
            "x": field("Flipper Length (mm)").bin(step=10),
            "y": field("Body Mass (g)").bin(step=500),
        }
    )
).mark(text(text=field("Body Mass (g)").count())).render(w=420, h=320)
```

An empty cell is a group with no rows, so a count over it is 0, and the mark
draws that 0.

## Axis

The axis along `dir` is continuous, and with a key per axis both axes are. A binned time column gives a time axis
whose inner row is the cells' own partition, with each label centered under
its cell, and an outer row of the parent level (years under months). A binned
number column gives a numeric axis. See
[Underlying Space](/internals/core/underlying-space#partition-each-group-in-its-cell)
for how the layout and the axis read the cells.
