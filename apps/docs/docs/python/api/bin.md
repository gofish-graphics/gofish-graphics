---
title: Bin
---

# Bin

The `Bin` family holds the ways to bin two fields together into cells of the
plane. A `Bin` value is the argument of `struct(x=..., y=...).bin(...)`, a key
that reads two fields at once. [`partition`](/python/api/operators/partition)
over that key gives each group its cell, and
[`region`](/python/api/marks/region) draws it.

::: gofish example:hexbin-of-us-airports hidden
:::

```python
from gofish import Bin, Color, chart, field, partition, region, struct

# airports: the airports of the contiguous United States
chart(airports, color=Color.gradient("blues"), axes=True).flow(
    partition(by=struct(x="longitude", y="latitude").bin(Bin.hex(radius=1)))
).mark(region(fill=field("longitude").count(), stroke="white")).render(w=600, h=360)
```

## Signature

```python
struct(*, x, y).bin(b)

Bin.hex(*, radius)
Bin.voronoi(*, seeds)
```

`struct(x=..., y=...)` takes two field names: `x` is the column read on the x
axis, and `y` the column read on the y axis. The name follows polars'
`pl.struct`. `.bin(b)` chains on it, as `.bin(...)` does on `field`, and takes
a call in the `Bin` family. A struct takes one bin. A struct is a key only once
it is binned: `partition(by=struct(x=..., y=...))` raises a `ValueError`.

Each member of the family returns a plain dict, `{"kind": ..., **params}`, for
example `{"kind": "hex", "radius": 0.5}`. It is the same value the JavaScript
`Bin` family makes.

The family is also a module of its own:

```python
from gofish import Bin, struct
from gofish.bin import hex  # the same function as Bin.hex
```

## Members

| Member                   | Its cells                                                       |
| ------------------------ | --------------------------------------------------------------- |
| `Bin.hex(radius=...)`    | A grid of hexagons that covers the domain of the two fields.    |
| `Bin.voronoi(seeds=...)` | One cell per seed: the points nearer to it than to other seeds. |

The cells are those of the two columns' domain in the chart's data, so every
group of a nested split sees the same cells, and an empty cell is kept. A row
that is missing either field is dropped.

## Bin.hex

```python
Bin.hex(radius=0.5)
Bin.hex(radius={"x": 1.5, "y": 250})
```

| Param    | Type            | Description                                                                                                                                                        |
| -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `radius` | `float \| dict` | The distance from a hexagon's center to its corners, in data units, above 0. One number when both fields share a unit, or `{"x": ..., "y": ...}` when they do not. |

The hexagons have a corner at the top (pointy-top), as in d3-hexbin, ggplot2's
`geom_hex` and Observable Plot. One hexagon is centered on the origin (0, 0),
so the grid does not move when the data does. A radius per axis, as in
ggplot2's `binwidth = c(x, y)`, scales each hexagon by the x radius on x and
the y radius on y. A radius that is not above 0 raises a `ValueError`, and a
dict with a missing or unknown key raises a `TypeError`.

::: gofish example:hexbin-of-car-mileage-and-weight hidden
:::

```python
chart(cars, color=Color.gradient("viridis"), axes=True).flow(
    partition(
        by=struct(x="Miles_per_Gallon", y="Weight_in_lbs").bin(
            Bin.hex(radius={"x": 1.5, "y": 250})
        )
    )
).mark(region(fill=field("Miles_per_Gallon").count())).render(w=480, h=360)
```

The cells are every hexagon whose inside meets the box of the domain, plus the
hexagon of each row. A point on an edge between two hexagons goes to one of
them, the same one every time. The hexagons are regular in data, so they look
regular on screen only when the two scales match.

## Bin.voronoi

```python
Bin.voronoi(seeds=hubs)
```

| Param   | Type                | Description                                                                                                  |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `seeds` | `list \| DataFrame` | The seed rows, with the same two fields as the key. Pass the chart's own data to give each row its own cell. |

`seeds` is a list of dict rows or a dataframe; it goes on the wire as dict
rows. Each row of the chart goes to its nearest seed. The cells are clipped to
the box that holds the data and the seeds, so every seed has a cell, and seeds
at the same point share one cell. Distances are measured in data units, so the
cells are meaningful when the two fields share a unit, such as longitude and
latitude.

::: gofish example:us-airports-by-nearest-hub hidden
:::

With `seeds` the chart's own data, each row has its own cell: the region
nearer to it than to any other row.

::: gofish example:voronoi-cells-of-a-scatterplot hidden
:::

```python
from gofish import Bin, chart, circle, layer, partition, region, scatter, struct

# beaked: the penguins that have both beak measurements
key = struct(x="Beak Length (mm)", y="Beak Depth (mm)")
layer([
    chart(beaked)
    .flow(partition(by=key.bin(Bin.voronoi(seeds=beaked))))
    .mark(region(fill="#f4f1ea", stroke="#b9b2a3", stroke_width=0.5)),
    chart(beaked)
    .flow(scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
    .mark(circle(r=2.5, fill="Species")),
]).render(w=480, h=360, axes=True)
```

See
[Underlying Space](/internals/core/underlying-space#cells-of-the-plane-a-binned-struct)
for how the cells are made and handed to each group.
