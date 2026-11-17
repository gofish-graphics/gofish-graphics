---
title: tile
order: 60
---

# tile

Lays out children into a treemap: a 2D tiling of rectangles, or of convex polygons with `Tiling.voronoi`, whose **areas are proportional to a weight**.

:::: gofish

```js
const items = [
  { name: "Action", value: 120 },
  { name: "Comedy", value: 80 },
  { name: "Drama", value: 160 },
  { name: "Sci-Fi", value: 60 },
  { name: "Horror", value: 40 },
];

// Each child gets its own rectangle; tile assigns its (x,y,w,h).
// `size` is an explicit per-child weight array (one value per child, in
// child order) that drives each leaf's tile area.
gf.tile(
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
      .label("name", { placement: "center", color: "white", fontSize: 12 })(
      d,
      d.name
    )
  )
).render(root, { w: 520, h: 320 });
```

::::

Inside `.flow(...)` (the fluent chart API), `tile({ by, size, ... })` partitions the
rows itself, mirroring `spread`/`group`: `by` groups the flow's rows (a field
name or a `field(...)` accessor carrying domain ops, e.g.
`field("genre").dropNulls()`), and `size` — an entry-flagged channel — sums a
field per group (or takes an explicit per-entry array) to weight each tile's
area. See [`spread`](./spread.md) for the `by`/entry-flagged-channel pattern
this mirrors.

## Signature

```ts
tile(options); // .flow() operator form
tile(options, children); // combinator form
```

## Parameters

::: gofish-ref tile
:::

## Strategies

The `tiling` option holds the tiling strategy, a member of the `Tiling` family. You make a
strategy with a function call. A strategy with no required option is also a
value as it is: `Tiling.voronoi` is `Tiling.voronoi()`. The family is also the
module `gofish-graphics/tiling`, so
`import { squarify } from "gofish-graphics/tiling"` gives the same function as
`Tiling.squarify`.

The first four are tiling methods from d3-hierarchy. They tile a rectangle,
so they need a rectangular region: inside a Voronoi cell or the oval of an
[`enclose`](./enclose.md), they are an error that names `Tiling.voronoi`.

- `Tiling.squarify({ ratio? })` makes tiles as close as it can to the aspect ratio
  `ratio`, the longer side over the shorter side. `ratio` must be at least 1,
  and it does not choose between wide and tall tiles. It is the default. Without `ratio`, it uses
  d3's default, the golden ratio. `Tiling.squarify({ ratio: 1 })` aims for square
  tiles, which suits one circle per leaf.
- `Tiling.slice()` puts the tiles in one column, stacked along y.
- `Tiling.dice()` puts the tiles in one row, side by side along x.
- `Tiling.binary()` splits the tiles into two halves of about equal weight, and
  repeats on each half.
- `Tiling.voronoi({ seed? })` cuts the region into convex cells with rounded,
  irregular shapes, by a weighted Voronoi diagram (Nocaj and Brandes 2012).
  It tiles any convex region, so a Voronoi level can sit inside a Voronoi
  cell, inside a rectangle of a squarified level, or inside the oval of an
  `enclose`. The sites start at random positions drawn from `seed` (default
  0), so a render is the same every time. The cells are fitted to
  within 2% of their shares before `spacing` takes the gaps off the borders
  between them.

```js
gf.tile({
  by: "genre",
  size: "gross",
  tiling: gf.Tiling.squarify({ ratio: 1 }),
});
```

Each `tile` in a flow is one level, and each level can use its own
tiling. A level hands each child its cell, and [`region()`](../marks/region.md)
draws the cell it is in. `spacing` is the gap between sibling cells, and
`padding` the inset at the `tile`'s own edge, under every tiling.

::: gofish example:voronoi-treemap
:::

The classic slice-and-dice treemap alternates `Tiling.slice` and `Tiling.dice` by
level, one flow step each:

```js
chart(countryPopulations)
  .flow(
    tile({ by: "continent", size: "pop", tiling: Tiling.slice }),
    tile({ by: "region", size: "pop", tiling: Tiling.dice })
  )
  .mark(rect({ fill: "continent" }));
```

## Notes

- The tile d3 places first sits at the top left. With the default
  `sort: "desc"`, that is the largest tile.
- A `tile` accepts a **flat list of children**; for multi-level treemaps, chain one `tile(...)` per level in `.flow(...)`, or nest `tile(...)` calls.
- A `tile` with no size of its own fills the shape its parent hands it: a cell of the `tile` around it, or the shape of an `enclose` around it.
- In the combinator form, `size` is an **explicit array**, one weight per child in child order — it does not read back off each child's bound datum.
