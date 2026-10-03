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
`dims["theta"]`, is an error too. The two ends of a span may come from either
spelling (`xMin` with `dims={"x": {"max": "hi"}}`), but one end without the
other is an error. Each value in `dims` is read like its top-level
counterpart: a point like `x`, a `min` like `xMin`. The circle's `r` is its
radius, not the polar axis: axis names only appear as keys of `dims`.

## Keeping dots apart with `overlap`

When a field places only one axis, every child sits on one line on the other
axis, at the scatter's `alignment`. Dots with close values then cover each
other. `overlap` moves each child along that free axis so the children no
longer overlap. A strategy only ever moves children along the free axis: each
child keeps the position its field gives it on the data axis, which `scatter`
alone places. You make the strategy with a function call.

- `swarm(padding=None)` makes a beeswarm. Each dot keeps its position on the
  data axis. Then, in data order, it moves to the free spot nearest the line.
  `padding` is the number of pixels kept between neighboring dots. The default
  is 0. This is the same placement as Observable Plot's `dodge`.

::: gofish example:penguin-mass-beeswarm hidden
:::

```python
from gofish import chart, circle, scatter, spread, swarm

weighed = [p for p in penguins if p["Body Mass (g)"] is not None]

chart(weighed, axes=True).flow(
    spread(by="Species", dir="y", spacing=16),
    scatter(x="Body Mass (g)", alignment="middle", overlap=swarm(padding=1)),
).mark(circle(r=3, fill="Species")).render(w=560, h=320)
```

The swarm grows from the `alignment` line:

- `"middle"` grows on both sides of the line.
- `"start"` and `"baseline"` grow on the positive side. Each dot's start edge
  is on the line or past it.
- `"end"` grows on the negative side.

Shapes other than circles are kept apart by their enclosing circle, the same
circle [`pack`](/python/api/operators/pack) uses.

The swarm is as tall as its dots need. It does not shrink to fit the space it
is given, so a dense swarm can grow past it. To make it smaller, use smaller
dots or less padding.

Some cases are errors:

- `overlap` when both `x` and `y` come from fields, because then no axis is
  free.
- `overlap` inside a coordinate space that is not linear, such as `polar()`.
  The swarm keeps dots apart in the layout frame, and a polar space bends that
  frame, so dots could still overlap on screen. See
  [#1002](https://github.com/gofish-graphics/gofish-graphics/issues/1002).

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
