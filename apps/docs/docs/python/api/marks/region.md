---
order: 65
---

# region

Draws the region its parent gives it, such as the cell a
[`partition`](/python/api/operators/partition) gives each group. A region has
no size or position of its own: it fills the space it is given on both axes.
Today every region is a rectangle.

::: gofish example:2d-histogram-of-movie-ratings hidden
:::

```python
from gofish import Color, chart, field, partition, region

chart(movies, color=Color.gradient("blues"), axes=True).flow(
    partition(
        by={
            "x": field("IMDB Rating").bin(step=0.5),
            "y": field("Rotten Tomatoes Rating").bin(step=5),
        }
    )
).mark(region(fill=field("IMDB Rating").count())).render(w=480, h=320)
```

## Signature

```python
region(**options) -> Mark
```

## Parameters

::: gofish-ref region
:::

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Examples

```python
# Outlined cells
.mark(region(fill="none", stroke="white", stroke_width=1))
```

A region is the space a parent hands a child. See
[Underlying Space](/internals/core/underlying-space#partition-each-group-in-its-cell)
for how a partition hands each child its cell.
