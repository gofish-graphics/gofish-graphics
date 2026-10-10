---
title: partition
order: 68
---

# partition

Divides the space into the cells of a binned key, one group per cell, and gives
each group its cell. Each cell sits at its true place on one continuous scale,
so a cell's width follows its width in data: a 29-day February is narrower than
a 31-day March. An empty cell keeps its place. With one key per axis, it
divides both axes into rectangles. With two fields binned together, it divides
the plane into hexagons or Voronoi cells.

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

`by` must be a key whose values have a region. That is a binned field,
`field(x).bin(...)`, whose values are cells, each an interval `[start, end)`,
or a binned struct, `struct(x=..., y=...).bin(...)`, whose values are cells
of the plane (see [Cells of the plane](#cells-of-the-plane)).

```python
partition(by=field("date").bin(Calendar.month), dir="x")  # true month widths
partition(by=field("rating").bin(step=0.5), dir="x")  # a histogram
```

A plain field has no region, so `partition(by="date", dir="x")` raises a
`ValueError`, and so does a struct with no bin,
`partition(by=struct(x="lon", y="lat"))`. To give each value an equal slot instead, use
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

It is the same as the 1D partition on x, then the 1D partition on y:

```python
partition(by=field("a").bin(step=1), dir="x"),
partition(by=field("b").bin(step=0.5), dir="y")
```

A partition inside a cell of another partition gives each of its groups that
cell on the other axis, so nesting the two in either order places the groups
the same way. There `alignment` has nothing to align.

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

## Cells of the plane

With `by` a binned struct, `partition` divides both axes at once into the
cells of a [`Bin`](/python/api/bin) call: `Bin.hex(radius=...)` for a grid
of hexagons, or `Bin.voronoi(seeds=...)` for one cell per seed. `dir` and
`alignment` are not allowed.

```python
partition(by=struct(x="lon", y="lat").bin(Bin.hex(radius=0.5)))
```

Each group gets its cell's outline. A [`region`](/python/api/marks/region)
draws it, so a hexbin is a `region` whose `fill` is a count. As in 1D, the
cells are those of the two columns' domain in the chart's data, and an empty
hexagon is a group with no rows, so it is drawn with a count of 0.

::: gofish example:hexbin-of-us-airports hidden
:::

```python
from gofish import Bin, Color, chart, field, partition, region, struct

# airports: the airports of the contiguous United States
chart(airports, color=Color.gradient("blues"), axes=True).flow(
    partition(by=struct(x="longitude", y="latitude").bin(Bin.hex(radius=1)))
).mark(region(fill=field("longitude").count(), stroke="white")).render(w=600, h=360)
```

A mark with a size of its own is centered in its cell's box, which for a
hexagon is its center.

::: gofish example:airport-counts-in-hexagons hidden
:::

With `Bin.voronoi`, each row goes to its nearest seed.

::: gofish example:us-airports-by-nearest-hub hidden
:::

```python
from gofish import Bin, Color, chart, circle, field, layer, partition, region, scatter, struct

# hubs: twenty hub airports, from the same table
layer([
    chart(airports, color=Color.gradient("reds")).flow(
        partition(by=struct(x="longitude", y="latitude").bin(Bin.voronoi(seeds=hubs)))
    ).mark(region(fill=field("iata").count(), stroke="white")),
    chart(hubs).flow(scatter(x="longitude", y="latitude")).mark(circle(r=3, fill="black")),
]).render(w=600, h=360, axes=True)
```

## Axis

The axis along `dir` is continuous, and with a key per axis or a binned
struct both axes are. A binned time column gives a time axis
whose inner row is the cells' own partition, with each label centered under
its cell, and an outer row of the parent level (years under months). A binned
number column gives a numeric axis. See
[Underlying Space](/internals/core/underlying-space#partition-each-group-in-its-cell)
for how the layout and the axis read the cells.
