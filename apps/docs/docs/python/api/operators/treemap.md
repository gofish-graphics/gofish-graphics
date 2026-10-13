---
title: treemap
order: 60
---

# treemap

Lays children out into a treemap: a 2D tiling of rectangles (or circles) whose
**areas are proportional to a weight**.

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
strategy with a function call. Each one is a tiling method from d3-hierarchy.
On the wire a strategy is a plain object, such as
`{"kind": "squarify", "ratio": 1}`. The family is also the module
`gofish.tile`, so `from gofish.tile import squarify` gives the same function as
`Tile.squarify`.

- `Tile.squarify(ratio=None)` makes tiles as close as it can to the aspect ratio
  `ratio`, the longer side over the shorter side. `ratio` must be at least 1,
  and it does not choose between wide and tall tiles. It is the default. Without `ratio`, it uses
  d3's default, the golden ratio. `Tile.squarify(ratio=1)` aims for square tiles,
  which suits one circle per leaf.
- `Tile.slice()` puts the tiles in one column, stacked along y.
- `Tile.dice()` puts the tiles in one row, side by side along x.
- `Tile.binary()` splits the tiles into two halves of about equal weight, and
  repeats on each half.
- `Tile.slice_dice()` alternates between `slice` and `dice` by depth.

```python
from gofish import treemap, Tile

treemap(by="genre", size="gross", tile=Tile.squarify(ratio=1))
```

## Notes

- The tile d3 places first sits at the top left. With the default
  `sort="desc"`, that is the largest tile.
- A treemap accepts a **flat list of children**; for multi-level treemaps,
  compose by nesting `treemap(...)` calls (or add a higher-level wrapper).
- In the combinator form, each child is bound to its row with
  `mark.bind_data(d, key)`; chain `.label(accessor, ...)` on the mark to show
  a field's value on each tile. `size` in combinator form is an **explicit
  list**, one weight per child in child order — it does not read back off
  each child's bound datum.
