---
title: tile
order: 60
---

# tile

Lays children out into a treemap: a 2D tiling of rectangles, or of convex
polygons with `Tiling.voronoi`, whose **areas are proportional to a weight**.

`tile` has two forms:

- **`tile(...)`** — an operator for use inside
  [`.flow()`](/python/api/core/flow); it tiles the partitioned data of a chart.
- **`tile(children, ...)`** — the low-level **combinator** form: it takes an
  explicit list of pre-data-bound marks and assigns each one its `(x, y, w, h)`.

The two share the same options below.

::: gofish example:circle-treemap hidden
:::

```python
from gofish import chart, circle, field, tile

# tile(by=..., size=...) partitions the flow's rows itself, mirroring
# spread/group: `by` groups (dropping null genres first), `size` sums
# worldwide gross per group to weight each tile's area.
chart(movies_raw).flow(
    tile(
        by=field("Major Genre").drop_nulls(),
        size="Worldwide Gross",
        spacing=2,
        padding=2,
        round=True,
    )
).mark(
    circle(fill="Major Genre", stroke="gray", stroke_width=1).label(
        "Major Genre", placement="center", color="white", font_size=12
    )
).render(w=700, h=420)
```

## Signature

```python
# Operator form (inside .flow())
tile(**options) -> Operator

# Combinator form (explicit children)
tile(children, **options) -> Mark
```

## Parameters

::: gofish-ref tile
:::

## Strategies

The `tiling` option holds the tiling strategy, a member of the `Tiling` family. You make a
strategy with a function call. A strategy with no required option is also a
value as it is: `Tiling.voronoi` is `Tiling.voronoi()`. On the wire a strategy is
a plain object, such as `{"kind": "squarify", "ratio": 1}`. The family is also
the module `gofish.tiling`, so `from gofish.tiling import squarify` gives the
same function as `Tiling.squarify`.

The first four are tiling methods from d3-hierarchy. They tile a rectangle,
so they need a rectangular region: inside a Voronoi cell or the oval of an
[`enclose`](./enclose.md), they are an error that names `Tiling.voronoi`.

- `Tiling.squarify(ratio=None)` makes tiles as close as it can to the aspect ratio
  `ratio`, the longer side over the shorter side. `ratio` must be at least 1,
  and it does not choose between wide and tall tiles. It is the default. Without `ratio`, it uses
  d3's default, the golden ratio. `Tiling.squarify(ratio=1)` aims for square tiles,
  which suits one circle per leaf.
- `Tiling.slice()` puts the tiles in one column, stacked along y.
- `Tiling.dice()` puts the tiles in one row, side by side along x.
- `Tiling.binary()` splits the tiles into two halves of about equal weight, and
  repeats on each half.
- `Tiling.voronoi(seed=None)` cuts the region into convex cells with rounded,
  irregular shapes, by a weighted Voronoi diagram (Nocaj and Brandes 2012).
  It tiles any convex region, so a Voronoi level can sit inside a Voronoi
  cell, inside a rectangle of a squarified level, or inside the oval of an
  `enclose`. The sites start at random positions drawn from `seed` (default
  0), so a render is the same every time. The cells are fitted to
  within 2% of their shares before `spacing` takes the gaps off the borders
  between them.

```python
from gofish import tile, Tiling

tile(by="genre", size="gross", tiling=Tiling.squarify(ratio=1))
```

Each `tile` in a flow is one level, and each level can use its own
tiling. A level hands each child its cell, and
[`region()`](/python/api/marks/region) draws the cell it is in. `spacing` is
the gap between sibling cells, and `padding` the inset at the `tile`'s own
edge, under every tiling.

::: gofish example:voronoi-treemap hidden
:::

```python
from gofish import Shape, Tiling, chart, enclose, region, tile

chart(country_populations, axes=False, w=480, h=480).flow(
    enclose(shape=Shape.oval, fill="none"),
    tile(by="continent", size="pop", spacing=5, tiling=Tiling.voronoi),
    tile(by="region", size="pop", spacing=2.5, tiling=Tiling.voronoi),
    tile(size="pop", spacing=1, tiling=Tiling.voronoi),
).mark(region(fill="continent"))
```

The classic slice-and-dice treemap alternates `Tiling.slice` and `Tiling.dice` by
level, one flow step each:

```python
chart(country_populations).flow(
    tile(by="continent", size="pop", tiling=Tiling.slice),
    tile(by="region", size="pop", tiling=Tiling.dice),
).mark(rect(fill="continent"))
```

## Notes

- The tile d3 places first sits at the top left. With the default
  `sort="desc"`, that is the largest tile.
- A `tile` accepts a **flat list of children**; for multi-level treemaps,
  chain one `tile(...)` per level in `.flow(...)`, or nest `tile(...)`
  calls.
- A `tile` with no size of its own fills the shape its parent hands it: a
  cell of the `tile` around it, or the shape of an `enclose` around it.
- In the combinator form, each child is applied to its row with
  `mark(d, key)` (see [Applying a mark to rows](/python/api/core/mark#applying-a-mark-to-rows)); chain `.label(accessor, ...)` on the mark to show
  a field's value on each tile. `size` in combinator form is an **explicit
  list**, one weight per child in child order — it does not read back off
  each child's bound datum.
