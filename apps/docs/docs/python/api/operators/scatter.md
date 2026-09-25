---
order: 40
---

# scatter

Positions groups by `x` and `y` data fields rather than packing them along an
axis. The basis for scatter plots and any chart with continuous positioning.

::: gofish example:scatter-plot hidden
:::

```python
from gofish import chart, scatter, circle

catch_locations = [
    {"lake": "Lake A", "x": 5.26, "y": 22.64},
    {"lake": "Lake B", "x": 30.87, "y": 120.75},
    {"lake": "Lake C", "x": 50.01, "y": 60.94},
    {"lake": "Lake D", "x": 115.13, "y": 94.16},
    {"lake": "Lake E", "x": 133.05, "y": 50.44},
    {"lake": "Lake F", "x": 85.99, "y": 172.78},
]

chart(catch_locations, axes=True).flow(scatter(by="lake", x="x", y="y")).mark(
    circle(r=5)
).render(w=500, h=300)
```

## Signature

```python
scatter(*, by=None, **options) -> Operator
```

## Parameters

::: gofish-ref scatter
:::

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

## Placing by axis name with `dims`

`x` and `y` mean the first and second axis in any coordinate space. To use the
names the enclosing coordinate space declares, pass them in the `dims` dict: a
plain value is the point, like `x`, and `{"min": ..., "max": ...}` is the span,
like `xMin`/`xMax`.

```python
# Under polar(): the same as scatter(by="id", x="bearing", y="distance")
chart(trips, coord=polar()) \
    .flow(scatter(by="id", dims={"theta": "bearing", "r": "distance"})) \
    .mark(circle(r=4))
```

A scatter only places its children, so a `"size"` inside `dims` is an error;
size the mark instead. Placing an axis twice, such as `x` together with
`dims["theta"]`, is an error too. The circle's `r` is its radius, not the polar
axis: axis names only appear as keys of `dims`.

## Examples

```python
# One point per row
chart(data).flow(scatter(x="x", y="y")).mark(circle(r=5))

# Group by a field — each group centered on its mean
chart(data).flow(scatter(by="lake", x="x", y="y")).mark(circle(r=8))
```

## Notes

- With `by`, each group is positioned at the mean of its members' `x`/`y`.
  Without `by`, every row is positioned individually.
- Use the range accessors (`xMin`/`xMax`/`yMin`/`yMax`) when a group should span
  an interval rather than sit at a point.
