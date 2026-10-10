---
title: Bin
---

# Bin

The `Bin` family holds the ways to bin two fields together into cells of the
plane. A `Bin` value is the argument of `struct({ x, y }).bin(...)`, a key that
reads two fields at once. [`partition`](/js/api/operators/partition) over that
key gives each group its cell, and [`region`](/js/api/marks/region) draws it.

::: gofish example:hexbin-of-us-airports
:::

## Signature

```ts
struct({ x, y }).bin(b);

Bin.hex({ radius });
Bin.voronoi({ seeds });
```

`struct({ x, y })` takes two field names: `x` is the column read on the x
axis, and `y` the column read on the y axis. The name follows polars'
`pl.struct`. `.bin(b)` chains on it, as `.bin(p)` does on
[`field`](/js/api/operators/spread#field-expression-pipeline), and takes a call
in the `Bin` family. A struct takes one bin. A struct is a key only once it is
binned: `partition({ by: struct({ x, y }) })` is a type error in TypeScript,
and an error when the chart renders.

Each member of the family returns a plain object, `{ kind, ...params }`, of
type `Bin.Bin`, for example `{ kind: "hex", radius: 0.5 }`. The same object is
the bin's wire form.

The family is also a module of its own:

```ts
import { Bin, struct } from "gofish-graphics";
import { hex } from "gofish-graphics/bin"; // the same function as Bin.hex
```

## Members

| Member                   | Its cells                                                       |
| ------------------------ | --------------------------------------------------------------- |
| `Bin.hex({ radius })`    | A grid of hexagons that covers the domain of the two fields.    |
| `Bin.voronoi({ seeds })` | One cell per seed: the points nearer to it than to other seeds. |

The cells are those of the two columns' domain in the chart's data, so every
group of a nested split sees the same cells, and an empty cell is kept. A row
that is missing either field is dropped.

## Bin.hex

```ts
Bin.hex({ radius: number | { x: number, y: number } });
```

| Param    | Type                                 | Description                                                                                                                                               |
| -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `radius` | `number \| { x: number, y: number }` | The distance from a hexagon's center to its corners, in data units, above 0. One number when both fields share a unit, or one per field when they do not. |

The hexagons have a corner at the top (pointy-top), as in d3-hexbin, ggplot2's
`geom_hex` and Observable Plot. One hexagon is centered on the origin (0, 0),
so the grid does not move when the data does. A radius per axis, as in
ggplot2's `binwidth = c(x, y)`, scales each hexagon by the x radius on x and
the y radius on y:

```ts
struct({ x: "Miles_per_Gallon", y: "Weight_in_lbs" }).bin(
  Bin.hex({ radius: { x: 1.5, y: 250 } })
);
```

::: gofish example:hexbin-of-car-mileage-and-weight
:::

The cells are every hexagon whose inside meets the box of the domain, plus the
hexagon of each row. A point on an edge between two hexagons goes to one of
them, the same one every time. The hexagons are regular in data, so they look
regular on screen only when the two scales match.

## Bin.voronoi

```ts
Bin.voronoi({ seeds: Record<string, unknown>[] })
```

| Param   | Type                        | Description                                                                                                  |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `seeds` | `Record<string, unknown>[]` | The seed rows, with the same two fields as the key. Pass the chart's own data to give each row its own cell. |

Each row goes to its nearest seed. The cells are clipped to the box that holds
the data and the seeds, so every seed has a cell, and seeds at the same point
share one cell. Distances are measured in data units, so the cells are
meaningful when the two fields share a unit, such as longitude and latitude.

```ts
partition({
  by: struct({ x: "longitude", y: "latitude" }).bin(
    Bin.voronoi({ seeds: hubs })
  ),
});
```

::: gofish example:us-airports-by-nearest-hub
:::

With `seeds` the chart's own data, each row has its own cell: the region
nearer to it than to any other row.

::: gofish example:voronoi-cells-of-a-scatterplot
:::

Uses [d3-delaunay](https://github.com/d3/d3-delaunay), which builds on
Delaunator. See
[Underlying Space](/internals/core/underlying-space#cells-of-the-plane-a-binned-struct)
for how the cells are made and handed to each group.
