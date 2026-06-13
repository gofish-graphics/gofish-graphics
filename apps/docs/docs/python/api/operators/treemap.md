# treemap

Lays children out into a treemap: a 2D tiling of rectangles (or circles) whose
**areas are proportional to a weight**.

GoFish exposes two spellings:

- **`treemap(...)`** — an operator for use inside
  [`.flow()`](/python/api/core/flow); it tiles the partitioned data of a chart.
- **`Treemap(children, ...)`** — the low-level **combinator** form: it takes an
  explicit list of pre-data-bound marks and assigns each one its `(x, y, w, h)`.

The two share the same options below.

::: gofish example:circle-treemap hidden
:::

```python
from gofish import Treemap, circle, datum

# Movie worldwide gross summed per major genre -> [(genre, gross), ...]
nodes = [
    circle(fill=datum(genre), stroke="gray", strokeWidth=1, label=True)
        .bind_data({"worldwideGross": gross}, genre)
    for genre, gross in genres
]

# Each child gets its own circle; Treemap assigns its (x, y, w, h).
# `valueField` reads weights from each child's bound datum.
Treemap(
    nodes,
    valueField="worldwideGross",
    paddingInner=2,
    paddingOuter=2,
    round=True,
).render(w=700, h=420)
```

## Signature

```python
# Operator form (inside .flow())
treemap(**options) -> Operator

# Combinator form (explicit children)
Treemap(children, **options) -> Mark
```

## Parameters

| Option                     | Type                                                                                       | Description                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valueField`               | `str`                                                                                      | Reads weights from each child's bound datum (`bind_data`); sums if the datum is a list.                                                                                                                                                                                                                                                                                   |
| `value`                    | `Callable`                                                                                 | Custom weight accessor (overrides `valueField`).                                                                                                                                                                                                                                                                                                                          |
| `paddingInner`             | `float`                                                                                    | Padding between sibling rectangles.                                                                                                                                                                                                                                                                                                                                       |
| `paddingOuter`             | `float`                                                                                    | Padding around the outer edge of the treemap.                                                                                                                                                                                                                                                                                                                             |
| `round`                    | `bool`                                                                                     | Round pixel positions/sizes.                                                                                                                                                                                                                                                                                                                                              |
| `tile`                     | `"squarify"` \| `"slice"` \| `"dice"` \| `"binary"` \| `"slicedice"` \| `"squarifyCircle"` | Tiling strategy (`"squarify"` default).                                                                                                                                                                                                                                                                                                                                   |
| `sort`                     | `"asc"` \| `"desc"` \| `"none"`                                                            | Sort leaves by weight before layout (`"desc"` default).                                                                                                                                                                                                                                                                                                                   |
| `flipY`                    | `bool`                                                                                     | When `True`, mirror the layout top-to-bottom inside the treemap box (default `False`).                                                                                                                                                                                                                                                                                    |
| `leafIntrinsicRadiusField` | `str`                                                                                      | Optional datum key for **radius** (pixels in treemap space): each leaf is laid out in a square `min(leafW, leafH, 2*radius)` so the same value can match across separate treemaps.                                                                                                                                                                                        |
| `x`, `y`                   | `float` \| `Value`                                                                         | Optional position offset for the treemap container.                                                                                                                                                                                                                                                                                                                       |
| `w`, `h`                   | `float` \| `Value`                                                                         | Optional size for the treemap container (the box tiled into). A `float` is an explicit pixel size; a `Value` (e.g. a data-driven `size` channel that sums a field) scales the box through the layout's scale system — and when several treemaps are faceted side by side, they share one scale so their boxes are proportional. When omitted, the treemap fills its slot. |

## Notes

- A treemap accepts a **flat list of children**; for multi-level treemaps,
  compose by nesting `Treemap(...)` calls (or add a higher-level wrapper).
- In the combinator form, each child is bound to its row with
  `mark.bind_data(d, key)` and a `datum(...)` channel (e.g.
  `fill=datum(genre)`) makes the built-in label show the key.
