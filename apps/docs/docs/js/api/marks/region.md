---
order: 65
---

# region

Draws the cell it is in, such as the cell a
[`partition`](/js/api/operators/partition) gives each group. A region has
no size or position of its own: on each axis where it is in a cell, it is
that cell, placed by its data through the partition's scale, and on an axis
where it is in no cell, it fills the space it is given.
A region with an outline, such as a hexagon or a Voronoi cell of a
partition over a binned struct, is drawn as that outline; any other region is
drawn as a rectangle.

::: gofish example:2d-histogram-of-movie-ratings
:::

## Signature

```ts
region({ fill?, stroke?, strokeWidth?, opacity?, filter?, inset?, debug? })
```

## Parameters

::: gofish-ref region
:::

## Examples

```ts
// A 2D histogram: each cell colored by its count
chart(movies, { color: Color.gradient("blues"), axes: true })
  .flow(
    partition({
      by: {
        x: field("IMDB Rating").bin(Bin.step(0.5)),
        y: field("Rotten Tomatoes Rating").bin(Bin.step(5)),
      },
    })
  )
  .mark(region({ fill: field("IMDB Rating").count() }));

// Outlined cells
.mark(region({ fill: "none", stroke: "white", strokeWidth: 1 }))

// Cells drawn in by 2 pixels on each side, leaving a 4 pixel gap
.mark(region({ fill: "steelblue", inset: 2 }))
```

See
[Underlying Space](/internals/core/underlying-space#partition-each-group-in-its-cell)
for how a partition gives each child its cell.
