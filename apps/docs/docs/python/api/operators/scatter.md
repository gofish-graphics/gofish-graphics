# scatter

Positions groups by `x` and `y` data fields rather than packing them along an
axis. The basis for scatter plots and any chart with continuous positioning.

::: starfish example:scatter-plot hidden
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

| Parameter                      | Type                | Description                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`                           | `str` \| `Callable` | Field, dotted path, or callable to group by — groups are placed at their **mean** x/y. Omit to position per row. Path-aware (use `"datum.field"` after a selection); see [`spread` → path-aware `by`](/python/api/operators/spread#path-aware-by). |
| `x`, `y`                       | `str`               | Field-name accessors for position. At least one is required.                                                                                                                                                                                       |
| `xMin`, `xMax`, `yMin`, `yMax` | `str`               | Range accessors — a group spans `[min, max]` in data space.                                                                                                                                                                                        |
| `alignment`                    | `str`               | `"start"`, `"middle"`, `"end"`, or `"baseline"`.                                                                                                                                                                                                   |

Returns an `Operator` for use inside [`.flow()`](/python/api/core/flow).

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
