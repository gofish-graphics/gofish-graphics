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
like `x_min`/`x_max`.

```python
# Under polar(): the same as scatter(by="id", x="bearing", y="distance")
chart(trips, coord=polar()) \
    .flow(scatter(by="id", dims={"theta": "bearing", "r": "distance"})) \
    .mark(circle(r=4))
```

A scatter only places its children, so a `"size"` inside `dims` is an error;
size the mark instead. Placing an axis twice, such as `x` together with
`dims["theta"]`, is an error too. The two ends of a span may come from either
spelling (`x_min` with `dims={"x": {"max": "hi"}}`), but one end without the
other is an error. Each value in `dims` is read like its top-level
counterpart: a point like `x`, a `min` like `x_min`. The circle's `r` is its
radius, not the polar axis: axis names only appear as keys of `dims`.

## Keeping dots apart with `overlap`

When a field places only one axis, every child sits on one line on the other
axis, at the scatter's `alignment`. Dots with close values then cover each
other. `overlap` moves each child along that free axis so the children no
longer overlap. A strategy only ever moves children along the free axis: each
child keeps the position its field gives it on the data axis, which `scatter`
alone places. You make the strategy with a function call.

There are two strategies. They differ in what sets the width of the cloud.

- `separate(padding=None)` keeps the dots apart. In data order, each dot
  moves along the free axis to the nearest free spot, so no two dots overlap.
  The counts set the width exactly: where many dots share a value, the cloud
  grows tall. The result is a beeswarm. `padding` is the number of pixels kept
  between neighboring dots. The default is 0.
- `noise(randomness=None, smoothing=None, padding=None, seed=None)` spreads
  the dots inside an outline. The outline is wide where many dots share a part
  of the data axis and narrow where few do, so it shows the shape of the
  distribution. The dots are placed inside it and may touch.

Two more functions make `noise` with other defaults. Any option you pass
replaces the default.

| Function   | Same as                                           | Looks like                         |
| ---------- | ------------------------------------------------- | ---------------------------------- |
| `noise()`  | `noise()`                                         | an outline that follows every pile |
| `sina()`   | `noise(smoothing="silverman")`                    | a violin filled with dots          |
| `jitter()` | `noise(randomness="uniform", smoothing=math.inf)` | classic jitter in a flat band      |

::: gofish example:penguin-mass-beeswarm hidden
:::

```python
from gofish import chart, circle, scatter, separate, spread

weighed = [p for p in penguins if p["Body Mass (g)"] is not None]

chart(weighed, axes=True).flow(
    spread(by="Species", dir="y", spacing=16),
    scatter(x="Body Mass (g)", alignment="middle", overlap=separate(padding=1)),
).mark(circle(r=3, fill="Species")).render(w=560, h=320)
```

`separate` places the dots the same way as Observable Plot's `dodge`. It is
not called `dodge` because in ggplot2 and plotnine `position_dodge` means
grouped bars, which is `spread` in GoFish. It is not called `beeswarm`
because that word names a family of layouts: greedy ones like this one,
force-directed ones, and packed ones. The name comes from the separation
constraints of constraint layout, as in WebCoLa and VPSC.

The same data with `noise()`:

::: gofish example:penguin-mass-noise hidden
:::

```python
from gofish import chart, circle, noise, scatter, spread

chart(weighed, axes=True).flow(
    spread(by="Species", dir="y", spacing=16),
    scatter(x="Body Mass (g)", alignment="middle", overlap=noise()),
).mark(circle(r=3, fill="Species")).render(w=560, h=320)
```

And with `sina()`, which gives each species a smooth violin outline:

::: gofish example:penguin-mass-sina-plot hidden
:::

```python
from gofish import chart, circle, scatter, sina, spread

chart(weighed, axes=True).flow(
    spread(by="Species", dir="y", spacing=16),
    scatter(x="Body Mass (g)", alignment="middle", overlap=sina()),
).mark(circle(r=3, fill="Species")).render(w=560, h=320)
```

### How the outline is made

Each dot adds a small bell-shaped bump to the outline, centered on its own
value. The bump is tallest at the dot and fades smoothly to zero on both
sides. The outline is the sum of all the bumps. So a dot near a point on the
data axis counts a lot there, a dot a little farther away counts less, and a
dot far away counts almost nothing. Only each bump is bell-shaped. The sum
follows the data: it can have several peaks, lean to one side, or show a
spike where many dots share one value.

The width of each bump is the `smoothing` option. This width is called the
bandwidth. A narrow bandwidth keeps small spikes in the data. A wide one
blurs them into a broad hill. Changing it changes the shape of the outline
but not its total size.

At the two ends of the data, part of each bump would fall past the last dot,
where there are no dots. The outline makes up for that part, so the ends
are not drawn too thin.

### Options

`noise`, `sina` and `jitter` take these options:

- `randomness` says how the dots are placed inside the outline.
  - `"blue"` is the default for `noise` and `sina`. Each dot tries a few
    spots and takes the one farthest from the dots already placed. The cloud
    looks even, with no clumps and no rows.
  - `"quasi"` spreads the dots by rank with a fixed sequence, as ggbeeswarm's
    quasirandom does. It is the fastest, so use it for very large data. Faint
    regular patterns can show in it.
  - `"uniform"` draws each offset at random, as classic jitter does. Dots can
    clump and leave gaps. It is the default for `jitter`.
- `smoothing` is the bandwidth of each bump, in data units of the data axis,
  for example grams. It can be:
  - a number. The default for `noise` is the narrowest bump, about one dot
    wide, so the outline follows the data closely, and a pile of equal values
    shows as a spike. A smaller number counts as that narrowest bump.
  - `"silverman"`, the default for `sina`. The bandwidth is worked out from
    the data with Silverman's rule of thumb, `0.9 · min(sd, IQR / 1.34) ·
n^(-1/5)`, separately for each group. This is the rule that ggforce's
    `geom_sina` and R's `density()` use, so the outline is the curve a violin
    plot draws. Spread out data gets wider bumps, and more data gets narrower
    ones. When every dot in a group has the same value, it uses the narrowest
    bump.
  - `math.inf`, the default for `jitter`. Every bump is flat, so the outline
    is a band of fixed width. With `randomness="uniform"`, that is classic
    jitter, as in seaborn's `stripplot` or ggplot's `position_jitter`.
- `padding` is a number of pixels added to each dot's width. The default
  is 0.
- `seed` seeds the `"blue"` and `"uniform"` placements. The default is
  fixed, so a chart looks the same every time it renders. Plain random jitter
  that changes between renders can change how a distribution looks; see
  Correll, "Teru Teru Bōzu: Defensive Raincloud Plots" (2023).

Every strategy grows from the `alignment` line:

- `"middle"` grows on both sides of the line.
- `"start"` and `"baseline"` grow on the positive side. Each dot's start edge
  is on the line or past it.
- `"end"` grows on the negative side.

Shapes other than circles are measured by their enclosing circle, the same
circle [`pack`](/python/api/operators/pack) uses.

The cloud is as tall as its dots need. It does not shrink to fit the space it
is given, so a dense beeswarm can grow past it. To make it smaller, use smaller
dots or less padding. `noise` does not make it smaller: its outline also
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
- Use the range accessors (`x_min`/`x_max`/`y_min`/`y_max`) when a group should span
  an interval rather than sit at a point.
