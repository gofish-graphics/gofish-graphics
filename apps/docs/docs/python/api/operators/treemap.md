---
title: treemap
order: 60
---

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

::: gofish-ref treemap
:::

## Notes

- A treemap accepts a **flat list of children**; for multi-level treemaps,
  compose by nesting `Treemap(...)` calls (or add a higher-level wrapper).
- In the combinator form, each child is bound to its row with
  `mark.bind_data(d, key)`; chain `.label(accessor, ...)` on the mark to show
  a field's value on each tile. `size` in combinator form is an **explicit
  list**, one weight per child in child order — it does not read back off
  each child's bound datum.
