---
title: treemap
order: 60
---

# treemap

Lays out children into a treemap: a 2D tiling of rectangles whose **areas are proportional to a weight**.

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

## Tiling strategies

`tile` holds the tiling strategy. You make a strategy with a function call.
Each one is a tiling method from d3-hierarchy.

- `squarify({ ratio? })` makes tiles as close as it can to the aspect ratio
  `ratio` (width over height). It is the default. Without `ratio`, it uses
  d3's default, the golden ratio. `squarify({ ratio: 1 })` aims for square
  tiles, which suits one circle per leaf.
- `slice()` puts the tiles in one column, stacked along y.
- `dice()` puts the tiles in one row, side by side along x.
- `binary()` splits the tiles into two halves of about equal weight, and
  repeats on each half.
- `sliceDice()` alternates between `slice` and `dice` by depth.

```js
gf.treemap({ by: "genre", size: "gross", tile: gf.squarify({ ratio: 1 }) });
```

## Notes

- The tile d3 places first sits at the top left. With the default
  `sort: "desc"`, that is the largest tile.
- `spacing` is the gap between sibling tiles and `padding` is the inset around
  the treemap's outer edge, both in pixels.
- A treemap accepts a **flat list of children**; for multi-level treemaps, compose by nesting `treemap(...)` calls (or add a higher-level wrapper).
- In the combinator form, `size` is an **explicit array**, one weight per child in child order — it does not read back off each child's bound datum.
