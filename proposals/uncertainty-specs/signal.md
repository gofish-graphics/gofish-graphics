# Uncertainty as signal

These examples draw a distribution itself, as ggdist does. Each one has a prototype in
today's GoFish in `packages/gofish-graphics/stories/proposals/uncertainty/Signal.stories.tsx`,
with its data in `signal-data.ts` next to it. The croissant charts are the merged stories
in `stories/forwardsyntax/Croissant.stories.tsx`. GoFish has no distribution type yet, so
every density grid, quantile and interval in the Today code is computed by hand in the
data file.

Three patterns repeat in the Today code, and the proposed marks remove all three.

- One table holds two or three kinds of rows (`kind: "slab"`, `"interval"`, `"point"`),
  and each layer picks its rows with `filter`. A distribution in one cell would replace
  the extra rows.
- The point interval is always the same three marks: a thin rect, a thick rect and a
  circle, read from five precomputed columns.
- The slab is a `ribbon` over a grid of `{ x, pdf }` rows.

### Croissant chart

A density curve cut at its quantiles into slices of equal probability, each with a dot at
its median (Fygenson, Bertini and Padilla, EuroVis 2026). It was merged in #1229, and
issue #1231 asks to replace its `quantileRows` helper with a real distribution.

![](img/croissant.png)

**Today** (the merged `Croissant` story):

```js
// grid = gridOf((x) => normPdf(x), -4, 4, 401): rows { x, pdf }
layer([
  chart(grid)
    .flow(scatter({ x: "x" }))
    .mark(ribbon({ h: "pdf", fill: "none" }).name("density")),
]).relate(({ density }) => [
  chart(grid)
    .flow(
      derive((rows) => quantileRows(rows, { x: "x", density: "pdf", n: 1000 })),
      partition({ by: field("x").bin(Bin.quantiles(10)), dir: "x" })
    )
    .mark(
      layer([
        intersect({ fill: FILL, stroke: STROKE, strokeWidth: 2 }, [
          density,
          region({ inset: 3 }),
        ]),
        circle({ cx: field("x").median(), cy: 6, r: 3, fill: STROKE }),
      ])
    ),
]);
```

Precomputed by hand: the density grid `{ x, pdf }` on [-4, 4], and then 1000 rows at the
curve's quantiles (`quantileRows`), so that `Bin.quantiles` and `median()` read the curve
and not the grid. The grid must be wide enough that the tails do not move the outer
quantiles.

**Proposed (A)**

```js
const x = dist.normal({ mean: "mean", sd: "sd" });
const params = [{ mean: 0, sd: 1 }];

layer([chart(params).mark(slab({ x, fill: "none" }).name("density"))]).relate(
  ({ density }) => [
    chart(params)
      .flow(partition({ by: x.bin(Bin.quantiles(10)), dir: "x" }))
      .mark(
        layer([
          intersect({ fill: FILL, stroke: STROKE, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: x.median(), cy: 6, r: 3, fill: STROKE }),
        ])
      ),
  ]
);
```

```python
x = dist.normal(mean="mean", sd="sd")
params = [{"mean": 0, "sd": 1}]

layer([chart(params).mark(slab(x=x, fill="none").name("density"))]).relate(
    lambda density: [
        chart(params)
        .flow(partition(by=x.bin(Bin.quantiles(10)), dir="x"))
        .mark(
            layer(
                [
                    intersect(
                        [density, region(inset=3)],
                        fill=FILL,
                        stroke=STROKE,
                        stroke_width=2,
                    ),
                    circle(cx=x.median(), cy=6, r=3, fill=STROKE),
                ]
            )
        )
    ]
)
```

The data is one row with the parameters. `partition` with `Bin.quantiles(10)` on a
distribution cuts its probability, not its rows. Each of the ten cells holds the same
distribution cut down to one slice, so `x.median()` in a cell is the slice's median.
There is no grid and no `derive`.

#### Ridgeline of croissants

The same chart, one per month of Seattle's daily highs, each cut at its own quintiles.

![](img/croissant-ridgeline.png)

**Today** (the merged `Ridgeline` story):

```js
chart(monthlyDensity, {
  w: args.w,
  axes: { x: { title: "Daily high (°C)" }, y: false },
})
  .flow(
    spread({
      by: field("month").sort(months),
      dir: "y",
      anchor: "baseline",
      spacing: 36,
    })
  )
  .mark(
    layer({ h: 34 }, [
      chart()
        .flow(scatter({ x: "temp_max" }))
        .mark(ribbon({ h: "pdf", fill: "none" }).name("density")),
    ]).relate(({ density }) => [
      chart()
        .flow(
          derive((rows) =>
            quantileRows(rows, { x: "temp_max", density: "pdf", n: 1000 })
          ),
          partition({ by: field("temp_max").bin(Bin.quantiles(5)), dir: "x" })
        )
        .mark(
          layer([
            intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
              density,
              region({ inset: 2 }),
            ]),
            circle({
              cx: field("temp_max").median(),
              cy: 5,
              r: 2.25,
              fill: STROKE,
            }),
          ])
        ),
    ])
  );
```

Precomputed by hand: a kernel density estimate per month, put on a grid of 161 rows from
three bandwidths below the month's lowest high to three above its highest.

**Proposed (A)**

```js
const temp = field("temp_max").kde(); // one smooth Dist per group, from its rows

chart(seattleWeather, {
  w: 520,
  axes: { x: { title: "Daily high (°C)" }, y: false },
})
  .flow(
    spread({
      by: field("month").sort(months),
      dir: "y",
      anchor: "baseline",
      spacing: 36,
    })
  )
  .mark(
    layer({ h: 34 }, [
      chart().mark(slab({ x: temp, fill: "none" }).name("density")),
    ]).relate(({ density }) => [
      chart()
        .flow(partition({ by: temp.bin(Bin.quantiles(5)), dir: "x" }))
        .mark(
          layer([
            intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
              density,
              region({ inset: 2 }),
            ]),
            circle({ cx: temp.median(), cy: 5, r: 2.25, fill: STROKE }),
          ])
        ),
    ])
  );
```

```python
temp = field("temp_max").kde()  # one smooth Dist per group, from its rows

(
    chart(seattle_weather, w=520, axes={"x": {"title": "Daily high (°C)"}, "y": False})
    .flow(
        spread(by=field("month").sort(months), dir="y", anchor="baseline", spacing=36)
    )
    .mark(
        layer([chart().mark(slab(x=temp, fill="none").name("density"))], h=34).relate(
            lambda density: [
                chart()
                .flow(partition(by=temp.bin(Bin.quantiles(5)), dir="x"))
                .mark(
                    layer(
                        [
                            intersect(
                                [density, region(inset=2)],
                                fill=FILL,
                                stroke=STROKE,
                                stroke_width=1.5,
                            ),
                            circle(cx=temp.median(), cy=5, r=2.25, fill=STROKE),
                        ]
                    )
                )
            ]
        )
    )
)
```

The data is the raw daily table. A plain column in a Dist channel is the group's rows as
draws (the one-fold rule in `types.md`), but its quantiles would be the sample's
quantiles, while the slab would draw a smoothed curve. The cuts would then not match the
drawn curve, which is the exact problem `quantileRows` solves today.
`field("temp_max").kde()` folds the group's rows into one smoothed distribution whose
density and quantiles are both those of the drawn curve. It is a fold like `.mean()`, and
its bandwidth option is `smoothing`, the word `Overlap.noise` already uses
(`.kde({ smoothing: 1.5 })`). This replaces the `dist.kde("temp_max")` first written here.

**Proposed (B)**

```js
chart(seattleWeather, {
  w: 520,
  axes: { x: { title: "Daily high (°C)" }, y: false },
})
  .flow(
    spread({
      by: field("month").sort(months),
      dir: "y",
      anchor: "baseline",
      spacing: 36,
    })
  )
  .mark(
    layer({ h: 34 }, [
      chart().mark(slab({ x: "temp_max", fill: "none" }).name("density")),
    ]).relate(({ density }) => [
      chart()
        .flow(
          partition({ by: field("temp_max").bin(Bin.quantiles(5)), dir: "x" })
        )
        .mark(
          layer([
            intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
              density,
              region({ inset: 2 }),
            ]),
            circle({
              cx: field("temp_max").median(),
              cy: 5,
              r: 2.25,
              fill: STROKE,
            }),
          ])
        ),
    ])
  );
```

B reads more simply, but it draws a different chart. The slab is a density stat over the
days, and the cuts are quintiles of the days. The slices then hold equal shares of days,
not equal shares of the drawn curve. In the synthesis this B code is legal and means
exactly that, and A differs from it by one `.kde()`. Pure B, with no Dist type, has no way
to say "cut the curve", so it would keep `quantileRows`. For the single normal, pure B
also needs draws: a sample of the normal first, and the cuts are then only as good as the
sample.

**New pieces needed**: `dist.normal`, `slab`, a `Bin.quantiles` that cuts a
distribution's probability, and a cell median that reads the cut distribution. The
ridgeline also needs `.kde()`. Overlap check: `partition` and `Bin.quantiles` already
exist, and the proposed form only changes what they read. Today `quantileRows` stands in
for the distribution by turning it into 1000 quantile rows. That is a full subsumption:
once a Dist is a cell, `quantileRows` can be deleted (#1231), and no second path remains.
`slab` over a `dist.*` is the same picture as `ribbon({ h: "pdf" })` over a grid that the
library makes itself.

### Half-eye

Per group, a density slab on one side of the baseline, with a point at the median, a
thick 66% interval and a thin 95% interval on the baseline. This is ggdist's
[`stat_halfeye`](https://mjskay.github.io/ggdist/reference/stat_halfeye.html).

![](img/half-eye.png)

**Today**

```js
chart(halfEyeRows, { w: 520, axes: { x: { title: "value" }, y: true } })
  .flow(spread({ by: "group", dir: "y", anchor: "baseline", spacing: 64 }))
  .mark(
    layer({ h: 60 }, [
      chart()
        .flow(
          filter((d) => d.kind === "slab"),
          scatter({ x: "x" })
        )
        .mark(ribbon({ h: "pdf", fill: SLAB })),
      chart()
        .flow(filter((d) => d.kind === "interval"))
        .mark(
          layer([
            rect({ x: "lo95", x2: "hi95", h: 1.5, fill: INK }),
            rect({ x: "lo66", x2: "hi66", h: 4, fill: INK }),
            circle({ cx: "median", r: 4, fill: INK }),
          ])
        ),
    ])
  );
```

Precomputed by hand: a 121-point density grid per group (`kind: "slab"` rows), and one
`kind: "interval"` row per group with the median and the 66% and 95% bounds from the
normal quantile function. The slabs share one density scale, which is ggdist's
`normalize = "all"`. The group labels sit at the middle of each row, not at its baseline,
because the y axis labels the row's box.

**Proposed (A)**

```js
const value = dist.normal({ mean: "mean", sd: "sd" });

chart(halfEyeGroups, { w: 520, axes: { x: { title: "value" }, y: true } })
  .flow(spread({ by: "group", dir: "y", anchor: "baseline", spacing: 64 }))
  .mark(
    layer({ h: 60 }, [
      slab({ x: value, fill: SLAB }),
      interval({ x: value, levels: [0.66, 0.95], fill: INK }),
    ])
  );
```

```python
value = dist.normal(mean="mean", sd="sd")

(
    chart(half_eye_groups, w=520, axes={"x": {"title": "value"}, "y": True})
    .flow(spread(by="group", dir="y", anchor="baseline", spacing=64))
    .mark(
        layer(
            [
                slab(x=value, fill=SLAB),
                interval(x=value, levels=[0.66, 0.95], fill=INK),
            ],
            h=60,
        )
    )
)
```

The data is four rows, `{ group, mean, sd }`. Under B the data would be a long table of
draws and the code would read the same with `x: "value"`, so B is not shown.

**New pieces needed**: `dist.normal`, `slab` and `interval`. Overlap check: `slab` is a
`ribbon` over a density grid that the mark computes, and `interval` is the three marks of
the next example. Both desugar exactly into existing marks once the grid and the
quantiles exist. There is no partial overlap with another operator.

### Multi-level point interval

A point at the median with a thick 66% interval and a thin 95% interval, one row per
group. This is ggdist's
[`stat_pointinterval`](https://mjskay.github.io/ggdist/reference/stat_pointinterval.html).

![](img/point-interval.png)

**Today**

```js
chart(pointIntervalRows, {
  w: 480,
  axes: { x: { title: "value" }, y: true },
})
  .flow(spread({ by: "group", dir: "y", spacing: 16 }))
  .mark(
    layer([
      rect({ x: "lo95", x2: "hi95", h: 1.5, fill: INK }),
      rect({ x: "lo66", x2: "hi66", h: 5, fill: INK }),
      circle({ cx: "median", r: 4, fill: INK }),
    ])
  );
```

Precomputed by hand: the five columns `median`, `lo66`, `hi66`, `lo95` and `hi95` per
group, from the normal quantile function.

**Proposed (A)**

```js
const value = dist.normal({ mean: "mean", sd: "sd" });

chart(pointIntervalGroups, { w: 480, axes: { x: { title: "value" }, y: true } })
  .flow(spread({ by: "group", dir: "y", spacing: 16 }))
  .mark(interval({ x: value, levels: [0.66, 0.95], fill: INK }));
```

```python
value = dist.normal(mean="mean", sd="sd")

(
    chart(point_interval_groups, w=480, axes={"x": {"title": "value"}, "y": True})
    .flow(spread(by="group", dir="y", spacing=16))
    .mark(interval(x=value, levels=[0.66, 0.95], fill=INK))
)
```

Without the `interval` mark, the summary field ops alone give the Today code with no
precomputed columns:

```js
layer([
  rect({ dims: { x: value.interval(0.95) }, h: 1.5, fill: INK }),
  rect({ dims: { x: value.interval(0.66) }, h: 5, fill: INK }),
  circle({ cx: value.median(), r: 4, fill: INK }),
]);
```

**New pieces needed**: `dist.normal` and `interval`, or only the summary ops
`.interval(p)` and `.median()`. Overlap check: `interval` desugars exactly into the layer
above, one rect per level with widths stepping down and a circle at the median. It is
shorthand, not a new kind of mark. `value.interval(0.95)` is a two-ended span, so it fills
a `dims` entry, the one span form the IR already has. `rect({ x: value.interval(0.95) })`
is an error, because `x` is one position. Two calls,
`x: value.quantile(0.025), x2: value.quantile(0.975)`, mean the same as the `dims` form.

### Gradient interval

A bar whose color fades with the density, with the point interval on top. This is
ggdist's
[`stat_gradientinterval`](https://mjskay.github.io/ggdist/reference/stat_gradientinterval.html).

![](img/gradient-interval.png)

**Today**

```js
chart(gradientRows, {
  w: 520,
  color: Color.gradient(["#ffffff", "#3a6ea5"]),
  legend: false,
  axes: { x: { title: "value" }, y: true },
})
  .flow(spread({ by: "group", dir: "y", spacing: 14 }))
  .mark(
    layer([
      chart()
        .flow(
          filter((d) => d.kind === "cell"),
          scatter({ xMin: "x0", xMax: "x1" })
        )
        .mark(
          rect({
            cy: 0,
            h: 22,
            fill: "density",
            stroke: "density",
            strokeWidth: 0.6,
          })
        ),
      chart()
        .flow(filter((d) => d.kind === "interval"))
        .mark(
          layer([
            rect({ x: "lo95", x2: "hi95", cy: 0, h: 1.5, fill: INK }),
            rect({ x: "lo66", x2: "hi66", cy: 0, h: 4, fill: INK }),
            circle({ cx: "median", cy: 0, r: 4, fill: INK }),
          ])
        ),
    ])
  );
```

This render is an approximation. GoFish has no fill gradient along one mark, and `opacity`
takes only a number, not a field. So each bar is 80 thin cells, and each cell's fill comes
from a white-to-blue color scale on the density at its center. On a white background this
looks like opacity. Faint seams between cells still show, and the stroke on each cell
only partly hides them. Precomputed by hand: the 80 cells `[x0, x1]` per group over
mean ± 3.5 sd, the density at each cell divided by the largest density of all groups, and
the interval row.

**Proposed (A)**

```js
const value = dist.normal({ mean: "mean", sd: "sd" });

chart(halfEyeGroups, { w: 520, axes: { x: { title: "value" }, y: true } })
  .flow(spread({ by: "group", dir: "y", spacing: 14 }))
  .mark(
    layer([
      gradient({ x: value, h: 22, fill: "#3a6ea5" }),
      interval({ x: value, levels: [0.66, 0.95], fill: INK }),
    ])
  );
```

```python
value = dist.normal(mean="mean", sd="sd")

(
    chart(half_eye_groups, w=520, axes={"x": {"title": "value"}, "y": True})
    .flow(spread(by="group", dir="y", spacing=14))
    .mark(
        layer(
            [
                gradient(x=value, h=22, fill="#3a6ea5"),
                interval(x=value, levels=[0.66, 0.95], fill=INK),
            ]
        )
    )
)
```

**New pieces needed**: `gradient`, and under it a real fill gradient in the renderer (an
SVG `linearGradient` with one stop per grid point). Overlap check: this is the one mark
here with no exact desugaring. The stepped version is a partition of the support into
cells plus a color scale, which is close but leaves seams and costs 80 nodes per bar. A
fill gradient along a mark is a general paint feature (it would also serve a heatmap
legend or a gradient area). It should be a paint option shared with other marks, and
`gradient` would be a `rect` that uses it. It should not be a one-off inside this mark.

### Quantile dotplot

Twenty quantiles of a bus's arrival time, binned and stacked, so each dot is a 5% chance
(Kay, Kola, Hullman and Munson,
["When (ish) is my bus?"](https://doi.org/10.1145/2858036.2858558), CHI 2016; ggdist
[`stat_dots`](https://mjskay.github.io/ggdist/reference/stat_dots.html) with
`quantiles = 20`).

![](img/quantile-dotplot.png)

**Today**

```js
chart(busDots, {
  w: 480,
  h: 160,
  axes: { x: { title: "minutes until the bus arrives" }, y: false },
})
  .flow(
    scatter({ by: "bin", x: "bin", alignment: "end" }),
    stack({ dir: "y", spacing: 1 })
  )
  .mark(circle({ r: 9, fill: SLAB, stroke: INK, strokeWidth: 1 }));
```

Precomputed by hand: the 20 quantiles of a lognormal with a median of 11 minutes, at
probabilities (i + 0.5) / 20, and the 1-minute bin of each. The bins are fixed width, not
Wilkinson's dot-density bins, and the dot radius is set by hand to about half a bin. The
`alignment: "end"` is what puts the stacks on the axis. With `"start"` or the default the
stacks hang from the top.

**Proposed (A)**

```js
const minutes = dist.lognormal({ meanlog: "meanlog", sdlog: "sdlog" });

chart([{ meanlog: Math.log(11), sdlog: 0.45 }], {
  w: 480,
  axes: { x: { title: "minutes until the bus arrives" }, y: false },
}).mark(dots({ x: minutes, n: 20, fill: SLAB, stroke: INK }));
```

```python
minutes = dist.lognormal(meanlog="meanlog", sdlog="sdlog")

chart(
    [{"meanlog": math.log(11), "sdlog": 0.45}],
    w=480,
    axes={"x": {"title": "minutes until the bus arrives"}, "y": False},
).mark(dots(x=minutes, n=20, fill=SLAB, stroke=INK))
```

`dist.lognormal` is one of the sheet's "etc." constructors. I named its parameters
`meanlog` and `sdlog`, as R and distributional do. Under B the code is the same with
`x: "minutes"` over a table of draws, and `dots` takes 20 quantiles of the sample.

**New pieces needed**: `dist.lognormal` and `dots`. Overlap check: `dots` desugars into
existing operators once the 20 quantiles are rows: a `scatter` by bin and a `stack` of
circles, which is the Today code. The step that turns one distribution into its `n`
quantile rows is the one missing piece. It is `quantileRows` again, and it is close to the
sheet's `sample({ n })`, except that it takes quantiles and not random draws. One spelling
would be `sample({ n: 20, at: "quantiles" })`. The dot binning (Wilkinson's method, with
the radius from the bin width) is new layout work in either form.

### Raincloud

Per species, a density slab above the baseline, the point interval on the baseline, and
the raw birds jittered below it (Allen et al.,
["Raincloud plots"](https://doi.org/10.12688/wellcomeopenres.15191.2), 2021; in ggdist,
`stat_halfeye` plus `stat_dots` with `side = "left"`).

![](img/raincloud.png)

**Today**

```js
chart(raincloudRows, {
  w: 560,
  legend: false,
  axes: { x: { title: "Body mass (g)" }, y: true },
})
  .flow(spread({ by: "species", dir: "y", spacing: 20 }))
  .mark(
    layer([
      chart()
        .flow(
          filter((d) => d.kind === "slab"),
          scatter({ x: "mass" })
        )
        .mark(ribbon({ h: "pdf", fill: "species", opacity: 0.7 })),
      chart()
        .flow(
          filter((d) => d.kind === "interval"),
          scatter({ y: 0 })
        )
        .mark(
          layer([
            rect({ x: "lo95", x2: "hi95", h: 1.5, fill: INK }),
            rect({ x: "lo66", x2: "hi66", h: 4, fill: INK }),
            circle({ cx: "median", r: 4, fill: INK }),
          ])
        ),
      chart()
        .flow(
          filter((d) => d.kind === "point"),
          scatter({ x: "mass", overlap: Overlap.jitter() }).translate({
            y: -16,
          })
        )
        .mark(circle({ r: 1.5, fill: "species", opacity: 0.6 })),
    ])
  );
```

Precomputed by hand: a kernel density estimate per species on a 121-point grid, and the
sample's median and 66% and 95% bounds. The raw birds are copied in as `kind: "point"`
rows. Two parts of the layout are workarounds. The points are moved below the baseline
with `.translate({ y: -16 })`. Once they are, the interval no longer sits on the baseline
on its own: a child with no position goes to the bottom of the layer. The `scatter({ y: 0 })`
pins it back to the baseline. A `stack` combinator of the points under the slab did not
separate them, which I did not track down.

**Proposed (A)**

```js
chart(penguins, { w: 560, axes: { x: { title: "Body mass (g)" }, y: true } })
  .flow(spread({ by: "Species", dir: "y", spacing: 20 }))
  .mark(
    layer([
      slab({ x: "Body Mass (g)", fill: "Species", opacity: 0.7 }),
      interval({ x: "Body Mass (g)", levels: [0.66, 0.95], fill: INK }),
      chart()
        .flow(
          scatter({ x: "Body Mass (g)", overlap: Overlap.jitter() }).translate({
            y: -16,
          })
        )
        .mark(circle({ r: 1.5, fill: "Species", opacity: 0.6 })),
    ])
  );
```

```python
(
    chart(penguins, w=560, axes={"x": {"title": "Body mass (g)"}, "y": True})
    .flow(spread(by="Species", dir="y", spacing=20))
    .mark(
        layer(
            [
                slab(x="Body Mass (g)", fill="Species", opacity=0.7),
                interval(x="Body Mass (g)", levels=[0.66, 0.95], fill=INK),
                chart()
                .flow(
                    scatter(x="Body Mass (g)", overlap=Overlap.jitter()).translate(
                        y=-16
                    )
                )
                .mark(circle(r=1.5, fill="Species", opacity=0.6)),
            ]
        )
    )
)
```

The first draft of A named the sample with `rvar("Body Mass (g)")`, a draw-less `rvar`.
`types.md` drops that: a plain column in a Dist channel is already the group's rows as
draws, by the one-fold rule. So A and B are the same code here, and the same column feeds
the slab, the interval and the points. The slab smooths the sample with a default
bandwidth. Writing `x: field("Body Mass (g)").kde()` would make the interval read the
smoothed curve instead of the sample; which one the default should be is an open
decision.

**New pieces needed**: `slab` and `interval`, which read a plain column as the group's
sample. Overlap check: `slab` and `interval` desugar as in the
half-eye. The rain part is the existing `Overlap.jitter()`. The placement of the rain
below the baseline is a real gap that neither approach fixes. The sheet's
`slab({ side })` covers the cloud. A `side` option on the jitter (or a `dots` mark with
`side: "start"`, as in ggdist) would place the rain without a pixel `translate`.

### Fan chart

An observed series, then nested 95%, 80% and 50% forecast bands around the median
forecast, widening with the horizon. This is the Bank of England fan chart (Britton, Fisher and Whitley, "The Inflation
Report projections: understanding the fan chart", Bank of England Quarterly Bulletin,
1998), and ggdist's
[`stat_lineribbon`](https://mjskay.github.io/ggdist/reference/stat_lineribbon.html).

![](img/fan-chart.png)

**Today**

```js
layer([
  chart(fanBands, {
    color: Color.palette({
      "95%": "#dbe6f2",
      "80%": "#a9c3df",
      "50%": "#6f98c6",
    }),
  })
    .flow(
      group({ by: "level" }),
      scatter({ by: "t", x: "t", yMin: "lo", yMax: "hi" })
    )
    .mark(rect({ w: 0, fill: "level" }))
    .layer(ribbon({ fill: "level" })),
  chart(fanMedian)
    .flow(scatter({ by: "t", x: "t", y: "value" }))
    .mark(line({ stroke: INK, strokeWidth: 2 })),
  chart(fanHistory)
    .flow(scatter({ by: "t", x: "t", y: "value" }))
    .mark(line({ stroke: "#333", strokeWidth: 1.5 })),
]).render(container, {
  w: 520,
  h: 300,
  axes: { x: { title: "time step" }, y: { title: "value" } },
});
```

Precomputed by hand: one band row per step and level with its normal quantile bounds, a
median row per step, and the history (a seeded random walk). The bands are zero-width
rects at each step, joined by a `ribbon`. The smooth band curve overshoots a little at
step 0, where the band has no width.

**Proposed (A)**

```js
const value = dist.normal({ mean: "median", sd: "sd" });

layer([
  chart(forecast)
    .flow(scatter({ by: "t", x: "t" }))
    .mark(
      interval({
        y: value,
        along: "t",
        levels: [0.5, 0.8, 0.95],
        fill: "#3a6ea5",
      })
    ),
  chart(history)
    .flow(scatter({ by: "t", x: "t", y: "value" }))
    .mark(line({ stroke: "#333", strokeWidth: 1.5 })),
]).render(container, {
  w: 520,
  h: 300,
  axes: { x: { title: "time step" }, y: { title: "value" } },
});
```

```python
value = dist.normal(mean="median", sd="sd")

layer(
    [
        chart(forecast)
        .flow(scatter(by="t", x="t"))
        .mark(interval(y=value, along="t", levels=[0.5, 0.8, 0.95], fill="#3a6ea5")),
        chart(history)
        .flow(scatter(by="t", x="t", y="value"))
        .mark(line(stroke="#333", stroke_width=1.5)),
    ]
).render(w=520, h=300, axes={"x": {"title": "time step"}, "y": {"title": "value"}})
```

The data is one row per step, `{ t, median, sd }`. I assumed that `interval` with `along`
draws the median as a line, as its point form draws the median as a point, and that one
`fill` gives the nested bands lighter shades of one color, as ggdist does. If it does not,
the median is a second chart with `y: value.median()`. Under B the data would be
sample paths, one row per step and draw, declared with
`schema: { value: { draws: "draw" } }`, and the code reads the same with `y: "value"`.
Only then does `band: Band.depth()` mean something, because whole paths exist.

**New pieces needed**: `dist.normal` and `interval` with `along`. Overlap check: it
desugars exactly into the Today code: per level, a zero-width rect from
`value.quantile(lo)` to `value.quantile(hi)` at each step, joined by a
`ribbon`, plus a `line` through the medians. The `along` form is the same mark as the
point interval, with `ribbon` in place of `rect` and `line` in place of `circle`, so it
fits the existing rule that `along` turns a mark into a connector.
