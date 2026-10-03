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

There are two strategies. They differ in what sets the width of the cloud.

- `swarm(padding=None)` makes a beeswarm. In data order, each dot moves to
  the free spot nearest the line. Dots never overlap, so the counts set the
  width exactly: where many dots share a value, the swarm grows tall.
  `padding` is the number of pixels kept between neighboring dots. The default
  is 0. This is the same placement as Observable Plot's `dodge`.
- `jitter(randomness=None, smoothing=None, padding=None, seed=None)` spreads
  the dots inside an outline. The outline is wide where many dots share a part
  of the data axis and narrow where few do, so it shows the shape of the
  distribution. The dots are placed inside it and may touch.

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

The same data with `jitter()`:

::: gofish example:penguin-mass-jitter hidden
:::

```python
from gofish import chart, circle, jitter, scatter, spread

chart(weighed, axes=True).flow(
    spread(by="Species", dir="y", spacing=16),
    scatter(x="Body Mass (g)", alignment="middle", overlap=jitter()),
).mark(circle(r=3, fill="Species")).render(w=560, h=320)
```

`jitter` takes these options:

- `randomness` says how the dots are placed inside the outline.
  - `"blue"` is the default. Each dot tries a few spots and takes the one
    farthest from the dots already placed. The cloud looks even, with no
    clumps and no rows.
  - `"quasi"` spreads the dots by rank with a fixed sequence, as ggbeeswarm's
    quasirandom does. It is the fastest, so use it for very large data. Faint
    regular patterns can show in it.
  - `"uniform"` draws each offset at random, as classic jitter does. Dots can
    clump and leave gaps.
- `smoothing` is a width in data units of the data axis, for example grams.
  The outline counts the dots within that window. By default the window is
  one dot wide, so the outline follows the data closely, and a pile of equal
  values shows as a spike. A larger `smoothing` gives a smoother outline. It
  changes the outline's shape but not its total size. In JavaScript,
  `smoothing: Infinity` makes the outline flat (classic jitter with
  `randomness: "uniform"`). Python cannot pass `float("inf")` yet, because the
  chart description sent to the renderer has no way to carry an infinite
  number; `jitter(smoothing=float("inf"))` raises an error. A `smoothing`
  about as wide as the data range gives a nearly flat outline.
- `padding` is a number of pixels added to each dot's width. The default
  is 0.
- `seed` seeds the `"blue"` and `"uniform"` placements. The default is
  fixed, so a chart looks the same every time it renders. Plain random jitter
  that changes between renders can change how a distribution looks; see
  Correll, "Teru Teru Bōzu: Defensive Raincloud Plots" (2023).

Both strategies grow from the `alignment` line:

- `"middle"` grows on both sides of the line.
- `"start"` and `"baseline"` grow on the positive side. Each dot's start edge
  is on the line or past it.
- `"end"` grows on the negative side.

Shapes other than circles are measured by their enclosing circle, the same
circle [`pack`](/python/api/operators/pack) uses.

The cloud is as tall as its dots need. It does not shrink to fit the space it
is given, so a dense swarm can grow past it. To make it smaller, use smaller
dots or less padding. `jitter` does not make it smaller: its outline also
grows with the counts, and it leaves extra room so the dots can spread.

Some cases are errors:

- `overlap` when both `x` and `y` come from fields, because then no axis is
  free.
- `overlap` inside a coordinate space that is not linear, such as `polar()`.
  The strategies measure distances in the layout frame, and a polar space
  bends that frame, so dots could still overlap on screen. See
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
