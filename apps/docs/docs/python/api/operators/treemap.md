---
title: treemap
order: 60
---

# treemap

Lays children out into a treemap: a 2D tiling of rectangles, or of convex
polygons with `Tile.voronoi`, whose **areas are proportional to a weight**.

`treemap` has two forms:

- **`treemap(...)`** — an operator for use inside
  [`.flow()`](/python/api/core/flow); it tiles the partitioned data of a chart.
- **`treemap(children, ...)`** — the low-level **combinator** form: it takes an
  explicit list of pre-data-bound marks and assigns each one its `(x, y, w, h)`.

The two share the same options below.

::: gofish example:circle-treemap hidden
:::

```python
from gofish import chart, circle, field, treemap

# treemap(by=..., size=...) partitions the flow's rows itself, mirroring
# spread/group: `by` groups (dropping null genres first), `size` sums
# worldwide gross per group to weight each tile's area.
chart(movies_raw).flow(
    treemap(
        by=field("Major Genre").drop_nulls(),
        size="Worldwide Gross",
        spacing=2,
        padding=2,
        round=True,
    )
).mark(
    circle(fill="Major Genre", stroke="gray", stroke_width=1).label(
        "Major Genre", position="center", color="white", font_size=12
    )
).render(w=700, h=420)
```

## Signature

```python
# Operator form (inside .flow())
treemap(**options) -> Operator

# Combinator form (explicit children)
treemap(children, **options) -> Mark
```

## Parameters

::: gofish-ref treemap
:::

## Strategies

`tile` holds the tiling strategy, a member of the `Tile` family. You make a
strategy with a function call. A strategy with no required option is also a
value as it is: `Tile.voronoi` is `Tile.voronoi()`. On the wire a strategy is
a plain object, such as `{"kind": "squarify", "ratio": 1}`. The family is also
the module `gofish.tile`, so `from gofish.tile import squarify` gives the same
function as `Tile.squarify`.

The first four are tiling methods from d3-hierarchy. They tile a rectangle,
so they need a rectangular region: inside a Voronoi cell or the oval of an
[`enclose`](./enclose.md), they are an error that names `Tile.voronoi`.

- `Tile.squarify(ratio=None)` makes tiles as close as it can to the aspect ratio
  `ratio`, the longer side over the shorter side. `ratio` must be at least 1,
  and it does not choose between wide and tall tiles. It is the default. Without `ratio`, it uses
  d3's default, the golden ratio. `Tile.squarify(ratio=1)` aims for square tiles,
  which suits one circle per leaf.
- `Tile.slice()` puts the tiles in one column, stacked along y.
- `Tile.dice()` puts the tiles in one row, side by side along x.
- `Tile.binary()` splits the tiles into two halves of about equal weight, and
  repeats on each half.
- `Tile.voronoi(seed=None)` cuts the region into convex cells with rounded,
  irregular shapes, by a weighted Voronoi diagram (Nocaj and Brandes 2012).
  It tiles any convex region, so a Voronoi level can sit inside a Voronoi
  cell, inside a rectangle of a squarified level, or inside the oval of an
  `enclose`. The sites start at random positions drawn from `seed` (default
  0), so a render is the same every time. The cells are fitted to
  within 2% of their shares before `spacing` takes the gaps off the borders
  between them.

```python
from gofish import treemap, Tile

treemap(by="genre", size="gross", tile=Tile.squarify(ratio=1))
```

Each `treemap` in a flow is one level, and each level can use its own
tiling. A level hands each child its cell, and
[`region()`](/python/api/marks/region) draws the cell it is in. `spacing` is
the gap between sibling cells, and `padding` the inset at the treemap's own
edge, under every tiling.

::: gofish example:voronoi-treemap hidden
:::

```python
from gofish import Shape, Tile, chart, enclose, region, treemap

chart(country_populations, axes=False, w=480, h=480).flow(
    enclose(shape=Shape.oval, fill="none"),
    treemap(by="continent", size="pop", spacing=5, tile=Tile.voronoi),
    treemap(by="region", size="pop", spacing=2.5, tile=Tile.voronoi),
    treemap(size="pop", spacing=1, tile=Tile.voronoi),
).mark(region(fill="continent"))
```

The classic slice-and-dice treemap alternates `Tile.slice` and `Tile.dice` by
level, one flow step each:

```python
chart(country_populations).flow(
    treemap(by="continent", size="pop", tile=Tile.slice),
    treemap(by="region", size="pop", tile=Tile.dice),
).mark(rect(fill="continent"))
```

## Notes

- The tile d3 places first sits at the top left. With the default
  `sort="desc"`, that is the largest tile.
- A treemap accepts a **flat list of children**; for multi-level treemaps,
  chain one `treemap(...)` per level in `.flow(...)`, or nest `treemap(...)`
  calls.
- A treemap with no size of its own fills the shape its parent hands it: a
  cell of the treemap around it, or the shape of an `enclose` around it.
- In the combinator form, each child is applied to its row with
  `mark(d, key)` (see [Applying a mark to rows](/python/api/core/mark#applying-a-mark-to-rows)); chain `.label(accessor, ...)` on the mark to show
  a field's value on each tile. `size` in combinator form is an **explicit
  list**, one weight per child in child order — it does not read back off
  each child's bound datum.
