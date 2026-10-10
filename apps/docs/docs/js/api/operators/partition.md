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

::: gofish example:monthly-sales-on-a-time-axis
:::

## Signature

```ts
partition({ by, dir, alignment?, axes? })
partition({ by: { x, y }, axes? })
```

`partition` has only the operator form, used inside `.flow(...)`. Its children
are the groups of its key, so there is no list of children to pass it.

## Parameters

::: gofish-ref partition
:::

## The key must have a region

`by` must be a key whose values have a region. Today that is a binned field,
`field(x).bin(p)`, whose values are cells. Each cell is an interval
`[start, end)`. See [the field-expression pipeline](/js/api/operators/spread#field-expression-pipeline)
for the partitions `.bin` takes.

```ts
partition({ by: field("date").bin(Calendar.month), dir: "x" }); // true month widths
partition({ by: field("rating").bin({ step: 0.5 }), dir: "x" }); // a histogram
```

A plain field has no region, so `partition({ by: "date", dir: "x" })` and
`partition({ by: field("date"), dir: "x" })` are type errors in TypeScript,
and errors when the chart renders. To give each value an equal slot instead,
use [`spread`](./spread) with the same key.

## Filling the cell

A mark with no size along `dir` fills its cell. [`rect`](/js/api/marks/rect)
is the mark for this. Its `inset` option draws it in from the edges of the
cell by a number of pixels, so neighboring bars are drawn apart. A mark with a
size of its own along `dir`, such as a [`circle`](/js/api/marks/circle) or a
[`text`](/js/api/marks/text), keeps its size and is centered in the cell.

An operator after `partition` divides the cell it is given. A
[`stack`](./stack) fills the cell's width, and a [`spread`](./spread) fits its
groups inside the cell, so February's group is narrower than March's.

::: gofish example:grouped-monthly-sales-on-a-time-axis
:::

## Both axes

With `by` keyed by axis, `partition` divides both axes. Each key must have a
region, and `dir` and `alignment` are not allowed.

```ts
partition({
  by: { x: field("a").bin({ step: 1 }), y: field("b").bin({ step: 0.5 }) },
});
```

It is the same as the 1D partition on x, then the 1D partition on y:

```ts
(partition({ by: field("a").bin({ step: 1 }), dir: "x" }),
  partition({ by: field("b").bin({ step: 0.5 }), dir: "y" }));
```

A partition inside a cell of another partition gives each of its groups that
cell on the other axis, so nesting the two in either order places the groups
the same way. There `alignment` has nothing to align.

Each group gets a rectangle: its x cell by its y cell. A
[`region`](/js/api/marks/region) fills it, so a 2D histogram is a `region`
whose `fill` is a count.

::: gofish example:2d-histogram-of-movie-ratings
:::

A mark with a size of its own is centered in its rectangle.

::: gofish example:penguin-counts-by-flipper-length-and-body-mass
:::

An empty cell is a group with no rows, so a count over it is 0, and the mark
draws that 0.

## Axis

The axis along `dir` is continuous, and with a key per axis both axes are. A binned time column gives a time axis
whose inner row is the cells' own partition, with each label centered under
its cell, and an outer row of the parent level (years under months). A binned
number column gives a numeric axis. See
[Underlying Space](/internals/core/underlying-space#partition-each-group-in-its-cell)
for how the layout and the axis read the cells.
