---
order: 65
---

# region

Draws the region its parent gives it, such as the cell a
[`partition`](/js/api/operators/partition) gives each group. A region has no
size or position of its own: it fills the space it is given on both axes.
A region with an outline, such as a hexagon or a Voronoi cell of a
partition over a binned struct, is drawn as that outline; any other region is
drawn as a rectangle.

::: gofish example:2d-histogram-of-movie-ratings
:::

## Signature

```ts
region({ fill?, stroke?, strokeWidth?, opacity?, filter?, debug? })
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
        x: field("IMDB Rating").bin({ step: 0.5 }),
        y: field("Rotten Tomatoes Rating").bin({ step: 5 }),
      },
    })
  )
  .mark(region({ fill: field("IMDB Rating").count() }));

// Outlined cells
.mark(region({ fill: "none", stroke: "white", strokeWidth: 1 }))
```

A region is the space a parent hands a child. See
[Underlying Space](/internals/core/underlying-space#partition-each-group-in-its-cell)
for how a partition hands each child its cell.
