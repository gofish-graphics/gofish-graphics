---
title: treemap
order: 60
---

# treemap

Lays out children into a treemap: a 2D tiling of rectangles, or of convex polygons with `Tile.voronoi`, whose **areas are proportional to a weight**.

:::: gofish

```js
const items = [
  { name: "Action", value: 120 },
  { name: "Comedy", value: 80 },
  { name: "Drama", value: 160 },
  { name: "Sci-Fi", value: 60 },
  { name: "Horror", value: 40 },
];

// Each child gets its own rectangle; treemap assigns its (x,y,w,h).
// `size` is an explicit per-child weight array (one value per child, in
// child order) that drives each leaf's tile area.
gf.treemap(
  {
    size: items.map((d) => d.value),
    spacing: 2,
    padding: 2,
    round: true,
  },
  gf.map(items, (d) =>
    gf
      .rect({
        fill: gf.v(d.name),
        stroke: "white",
        strokeWidth: 1,
        rx: 3,
        ry: 3,
      })
      .label("name", { position: "center", color: "white", fontSize: 12 })(
      d,
      d.name
    )
  )
).render(root, { w: 520, h: 320 });
```

::::

Inside `.flow(...)` (the fluent chart API), `treemap({ by, size, ... })` partitions the
rows itself, mirroring `spread`/`group`: `by` groups the flow's rows (a field
name or a `field(...)` accessor carrying domain ops, e.g.
`field("genre").dropNulls()`), and `size` — an entry-flagged channel — sums a
field per group (or takes an explicit per-entry array) to weight each tile's
area. See [`spread`](./spread.md) for the `by`/entry-flagged-channel pattern
this mirrors.

## Signature

```ts
treemap(options); // .flow() operator form
treemap(options, children); // combinator form
```

## Parameters

::: gofish-ref treemap
:::

## Strategies

`tile` holds the tiling strategy, a member of the `Tile` family. You make a
strategy with a function call. A strategy with no required option is also a
value as it is: `Tile.voronoi` is `Tile.voronoi()`. The family is also the
module `gofish-graphics/tile`, so
`import { squarify } from "gofish-graphics/tile"` gives the same function as
`Tile.squarify`.

The first four are tiling methods from d3-hierarchy. They tile a rectangle,
so they need a rectangular region: inside a Voronoi cell or the oval of an
[`enclose`](./enclose.md), they are an error that names `Tile.voronoi`.

- `Tile.squarify({ ratio? })` makes tiles as close as it can to the aspect ratio
  `ratio`, the longer side over the shorter side. `ratio` must be at least 1,
  and it does not choose between wide and tall tiles. It is the default. Without `ratio`, it uses
  d3's default, the golden ratio. `Tile.squarify({ ratio: 1 })` aims for square
  tiles, which suits one circle per leaf.
- `Tile.slice()` puts the tiles in one column, stacked along y.
- `Tile.dice()` puts the tiles in one row, side by side along x.
- `Tile.binary()` splits the tiles into two halves of about equal weight, and
  repeats on each half.
- `Tile.voronoi({ seed? })` cuts the region into convex cells with rounded,
  irregular shapes, by a weighted Voronoi diagram (Nocaj and Brandes 2012).
  It tiles any convex region, so a Voronoi level can sit inside a Voronoi
  cell, inside a rectangle of a squarified level, or inside the oval of an
  `enclose`. The sites start at random positions drawn from `seed` (default
  0), so a render is the same every time. The cells are fitted to
  within 2% of their shares before `spacing` takes the gaps off the borders
  between them.

```js
gf.treemap({
  by: "genre",
  size: "gross",
  tile: gf.Tile.squarify({ ratio: 1 }),
});
```

Each `treemap` in a flow is one level, and each level can use its own
tiling. A level hands each child its cell, and [`region()`](../marks/region.md)
draws the cell it is in. `spacing` is the gap between sibling cells, and
`padding` the inset at the treemap's own edge, under every tiling.

::: gofish example:voronoi-treemap
:::

The classic slice-and-dice treemap alternates `Tile.slice` and `Tile.dice` by
level, one flow step each:

```js
chart(countryPopulations)
  .flow(
    treemap({ by: "continent", size: "pop", tile: Tile.slice }),
    treemap({ by: "region", size: "pop", tile: Tile.dice })
  )
  .mark(rect({ fill: "continent" }));
```

## Notes

- The tile d3 places first sits at the top left. With the default
  `sort: "desc"`, that is the largest tile.
- A treemap accepts a **flat list of children**; for multi-level treemaps, chain one `treemap(...)` per level in `.flow(...)`, or nest `treemap(...)` calls.
- A treemap with no size of its own fills the shape its parent hands it: a cell of the treemap around it, or the shape of an `enclose` around it.
- In the combinator form, `size` is an **explicit array**, one weight per child in child order — it does not read back off each child's bound datum.
