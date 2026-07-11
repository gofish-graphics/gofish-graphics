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
from gofish import chart, circle, field, treemap

# treemap(by=..., size=...) partitions the flow's rows itself, mirroring
# spread/group: `by` groups (dropping null genres first), `size` sums
# worldwide gross per group to weight each tile's area.
chart(movies_raw).flow(
    treemap(
        by=field("Major Genre").drop_nulls(),
        size="Worldwide Gross",
        paddingInner=2,
        paddingOuter=2,
        round=True,
    )
).mark(
    circle(fill="Major Genre", stroke="gray", strokeWidth=1).label(
        "Major Genre", position="center", color="white", fontSize=12
    )
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
| `by`                       | `str` \| `FieldAccessor`                                                                   | **Operator form only** (`.flow()`): field to partition rows by; also accepts a `field(...)` accessor carrying domain ops (`sort`/`reverse`/`bin`/`drop_nulls`). Without `by`, one leaf is emitted per row.                                                                                                                                                                |
| `size`                     | `str` \| `FieldAccessor` \| `list`                                                         | Per-leaf weight driving tile area — entry-flagged (one value per split entry): a field name (summed by default), a `field(...)` accessor, or an explicit per-child list (combinator form).                                                                                                                                                                                |
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
  `mark.bind_data(d, key)`; chain `.label(accessor, ...)` on the mark to show
  a field's value on each tile. `size` in combinator form is an **explicit
  list**, one weight per child in child order — it does not read back off
  each child's bound datum.
