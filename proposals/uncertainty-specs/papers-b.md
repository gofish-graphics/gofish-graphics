# Papers B: uncertainty examples from recent IEEE VIS papers

Prototype stories: `packages/gofish-graphics/stories/proposals/uncertainty/PapersB.stories.tsx`
(title `Proposals/Uncertainty/Papers B`). Data and helpers, with a seeded
mulberry32 RNG and Box–Muller normals: `papers-b-data.ts` next to it. Each
render below is the story's PNG.

### Depth band vs pointwise ribbon for a line ensemble

Fifty whole-curve draws summarized two ways: pointwise quantile ribbons, and a
functional boxplot whose band is the envelope of the deepest half of the curves
under modified band depth. Sources: Chaves-de-Plaza et al., "Inclusion Depth for
Contour Ensembles", TVCG 2024 (doi 10.1109/TVCG.2024.3350076), and the
functional boxplot of Sun and Genton (JCGS 2011).

![](img/depth-band-vs-pointwise.png)

**Today**

```js
// Today, panel (b). Panel (a) is the same with pointwiseBands and
// pointwiseMedian, and no outlier layer.
layer([
  chart(curveDraws)
    .flow(group({ by: "curve" }), scatter({ x: "x", y: "y" }))
    .mark(line({ stroke: "#999", strokeWidth: 0.5, opacity: 0.4 })),
  chart(depthBands, { color: BLUES })
    .flow(group({ by: "level" }), scatter({ by: "x", x: "x" }))
    .mark(rect({ w: 0, y: "lo", y2: "hi", fill: "level" }))
    .layer(ribbon({ along: "x", fill: "level" })),
  chart(depthMedian)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(line({ stroke: "#08306b", strokeWidth: 2 })),
  chart(depthOutliers)
    .flow(group({ by: "curve" }), scatter({ x: "x", y: "y" }))
    .mark(line({ stroke: "#d62728", strokeWidth: 1, strokeDasharray: "4 2" })),
]);
```

Precomputed by hand: the pointwise quantiles and median at each x, the modified
band depth of each curve, the envelope of the deepest 25 curves, the deepest
curve, the 1.5-times-band outlier rule, and the envelope of the non-outliers.
The planted shape outliers (two curves with a fast wiggle) stay inside the
1.5-times band, so the rule flags only the curve that jumps. This is how the
functional boxplot behaves, not a rendering issue. Panel (b) shows that the
deepest curve is a real smooth member, while the pointwise median in (a) is
bumpy and is no member at all.

**Proposed (A)**

```js
const draws = { schema: { y: { draws: "curve" } } };

// (a) pointwise quantile ribbons and the pointwise median
chart(curveDraws, draws)
  .flow(scatter({ by: "x", x: "x" }))
  .mark(
    interval({ y: "y", along: "x", levels: [0.5, 0.9], band: Band.pointwise() })
  );

// (b) depth band: the envelope of the deepest 50% of whole curves, the
// deepest curve as the median, and the outlier curves
chart(curveDraws, draws)
  .flow(scatter({ by: "x", x: "x" }))
  .mark(
    interval({
      y: "y",
      along: "x",
      levels: [0.5],
      band: Band.depth({ outliers: 1.5 }),
    })
  );
```

```python
schema = {"y": {"draws": "curve"}}

# (a) pointwise quantile ribbons
chart(curve_draws, schema=schema).flow(scatter(by="x", x="x")).mark(
    interval(y="y", along="x", levels=[0.5, 0.9], band=Band.pointwise())
)

# (b) depth band
chart(curve_draws, schema=schema).flow(scatter(by="x", x="x")).mark(
    interval(y="y", along="x", levels=[0.5], band=Band.depth(outliers=1.5))
)
```

**Proposed (B)** is the same code. The first draft of B put the draw key on
the mark, `interval({ y: "y", draw: "curve", ... })`, because B had no `rvar`.
With the draw key in the column record, neither approach needs a per-mark
`draw` option.

**New pieces needed**

- The record's `draws` key, `interval` with `along`, and the `Band` family with
  `pointwise()` and `depth()`. `Band.depth({ outliers })` (a number, default
  1.5, or `false`) is the spelling `types.md` adopted from this example.
- `Band.depth()` also changes what the median line is: the deepest whole draw,
  not the pointwise median. The strategy owns that choice.
- Overlap: `Band.pointwise()` desugars exactly into today's
  `scatter({ by: "x" })` + `rect({ y, y2 })` + `ribbon({ along: "x" })`, with
  per-x quantiles as the rect's `y` and `y2`. `Band.depth()` does not desugar
  into per-x summaries. It needs one aggregation over the draw key across all x
  (the depth of each curve), then a filter to the deepest k%, and only then a
  pointwise min and max. So there is a large partial overlap: after the depth
  ranking, the rest is the pointwise path on a subset of draws. One could expose
  the ranking as a field op (`field(y).depth()`) and build the band from it, but
  then the user writes the filter and the envelope by hand.
- Depth needs to know which rows form one curve. The column record says so,
  in A and B alike. The checker can use it too: `Band.depth()` over
  independent draws has no whole curves to rank.

### Correlated field draws, small multiples

Ten draws of a 20 by 20 scalar field with a planted elliptical region that
rises and falls together across draws, shown as a 2 by 5 small multiple in
viridis. Source: Zhao and Berger, "Evaluating judgements of spatial correlation
in visual displays of scalar field distributions", VIS 2025
([arXiv 2507.17997](https://arxiv.org/abs/2507.17997)).

![](img/correlated-field-draws.png)

**Today**

```js
chart(fieldDraws, { color: Color.gradient("viridis"), w: 748, h: 292 })
  .flow(
    table({ by: { x: "col", y: "row" }, spacing: 12 }),
    table({ by: { x: "j", y: "i" }, spacing: 0 })
  )
  .mark(rect({ fill: "value" }))
  .render(container, { axes: false });
```

Precomputed by hand: the draws themselves (white noise smoothed by a Gaussian
blur with sigma 1.5 cells, plus one shared normal offset per draw inside a
soft-edged ellipse, which stands in for the paper's Gaussian process), and each
draw's grid position (`row`, `col`). The legend's end labels show raw decimals;
that is a legend formatting issue, not part of this example. The HOP version
also works today: replace the outer `table` with `time.sequence({ by: "draw" })`
(not rendered here, since the capture is a still image).

**Proposed (A)**

```js
const options = {
  schema: { value: { draws: "draw" } },
  color: Color.gradient("viridis"),
};

// small multiples: one panel per draw, five to a row
// new: single-key table with numCols in flow form
chart(fieldDraws, options)
  .flow(
    table({ by: "draw", numCols: 5, spacing: 12 }),
    table({ by: { x: "j", y: "i" } })
  )
  .mark(rect({ fill: "value" }));

// HOP: the same chart with the draw key on time instead of space
chart(fieldDraws, options)
  .flow(time.sequence({ by: "draw" }), table({ by: { x: "j", y: "i" } }))
  .mark(rect({ fill: "value" }));
```

```python
schema = {"value": {"draws": "draw"}}
viridis = Color.gradient("viridis")

# small multiples
# new: single-key table with num_cols in flow form
chart(field_draws, schema=schema, color=viridis).flow(
    table(by="draw", num_cols=5, spacing=12), table(by={"x": "j", "y": "i"})
).mark(rect(fill="value"))

# HOP
chart(field_draws, schema=schema, color=viridis).flow(
    time.sequence(by="draw"), table(by={"x": "j", "y": "i"})
).mark(rect(fill="value"))
```

Proposed (B) is the same chart without the schema record, since the data is
already draws.

**New pieces needed**

- The record's `draws` key only, and here it changes nothing in the drawing:
  when the data is a long table of draws and the flow places the draw key, A
  and B are the same chart. The record matters when a signal mark consumes
  `value`, and for the checks.
- A single-key `table({ by, numCols })` in flow form is new (`numCols: 5` for
  five panels a row). The first draft wrote `spread({ wrap: 5 })`. The noise
  map needs the same grid, and `table` already has `numCols`, so both use
  `table`. It is a layout option, not an uncertainty option. Today the grid
  position is data.
- This example is the strongest case for shared draws. If each cell were an
  independent `dist.normal` and the chart called `sample({ n: 10 })`, the
  correlated region would vanish. `sample` keeps the draw ids of a draws
  column, so they stay joint (`HasDraws { joint: true }`), and the docs should
  say that sampling independent cells cannot show this.
- Overlap: exact. Small multiples and HOPs are existing operators over the draw
  key. The design point is only that the draw key is an ordinary `by` key, so
  the choice of space or time (which the paper shows changes which judgment is
  easy) stays with the user.

### Density slabs: shared scale vs per-curve rescaling

Three normal densities with standard deviations 0.6, 1 and 1.8, drawn with one
shared density scale (equal area), and with each curve rescaled to the same peak
height. Source: Fygenson and Padilla, "The Impact of Vertical Scaling on Normal
Probability Density Function Plots", VIS 2024 ([OSF](https://osf.io/w3dgq)).
Rescaling makes the wide curve C look like it holds far more probability than it
does.

![](img/density-scaling.png)

**Today**

```js
const densities = (rows) =>
  chart(rows, { w: 340, h: 200 })
    .flow(group({ by: "curve" }), scatter({ by: "x", x: "x" }))
    .mark(ribbon({ h: "density", fill: "curve", opacity: 0.45 }));
densities(equalArea).render(a, { axes: true });
densities(equalPeak).render(b, { axes: true });
```

Precomputed by hand: each density on a 241-point grid, and in panel (b) each
curve multiplied by the tallest peak over its own peak.

**Proposed (A)**

```js
// params: [{ curve, mean, sd }], one row per curve
const d = dist.normal({ mean: "mean", sd: "sd" });

// (a) equal area: one density scale for every slab (the default)
chart(params)
  .flow(group({ by: "curve" }))
  .mark(slab({ x: d, fill: "curve", opacity: 0.45, normalize: "all" }));

// (b) equal peak: each slab rescaled to the same height. The lint warns here.
chart(params)
  .flow(group({ by: "curve" }))
  .mark(slab({ x: d, fill: "curve", opacity: 0.45, normalize: "group" }));
```

```python
d = dist.normal(mean="mean", sd="sd")

# (a) equal area
chart(params).flow(group(by="curve")).mark(
    slab(x=d, fill="curve", opacity=0.45, normalize="all")
)

# (b) equal peak (the lint warns)
chart(params).flow(group(by="curve")).mark(
    slab(x=d, fill="curve", opacity=0.45, normalize="group")
)
```

**Proposed (B)**

```js
// B: the data is samples, and the slab is a density estimate over each group's rows.
chart(samples)
  .flow(group({ by: "curve" }))
  .mark(slab({ x: "value", fill: "curve", opacity: 0.45, normalize: "all" }));
```

The lint on panel (b), proposed text: "These slabs share a layout but use
`normalize: "group"`, so their heights do not compare. Readers misjudge which
curve holds more probability in a range (Fygenson and Padilla 2024). Use
`normalize: "all"`, or split the slabs into panels."

**New pieces needed**

- `dist.normal`, `slab` with `normalize`, and the lint.
- Overlap: `slab({ x: d })` with `normalize: "all"` desugars exactly into
  today's density grid + `scatter({ by: "x", x: "x" })` + `ribbon({ h })`,
  because a shared `h` scale is what GoFish already does. `normalize: "group"`
  is a per-group rescale in data. So the slab mark itself adds the grid
  evaluation of the density and nothing else.
- The lint is the new part. It needs the slab's thickness to carry a measure
  type, "density of x", so that a per-group rescale gives a different unit per
  group and the shared-axis check catches it. This ties to the measure types
  work (#1197, tracked in #1199).
- In B the density is a kernel estimate from samples, so it needs a bandwidth.
  `types.md` puts it on the fold, not on `slab`:
  `slab({ x: field("value").kde({ smoothing: 0.3 }) })`. `smoothing` is
  `Overlap.noise`'s word for the same bandwidth. A, with a known family, does
  not need one.

### Timeline with uncertain start and end times

Seven activities on a day timeline whose start and end times are uncertain,
drawn with fading ends (a) and with dashed ends over each end's 95% range (b).
Source: Potter et al., "An Evaluation of Temporal and Categorical Uncertainty on
Timelines", VIS 2025 short ([OSF](https://osf.io/98p6m/)), which found
transparency read more accurately than dashing. I could not open the paper's
figures (the OSF page did not load as text), so the exact styling is my guess
from the abstract.

![](img/uncertain-timeline.png)

**Today**

```js
// (a) each bar cut into slices with a precomputed P(on), shaded white to blue
chart(activitySlices, {
  w: 420,
  h: 240,
  color: Color.gradient(["#ffffff", BAR]),
})
  .flow(spread({ by: ROWS, dir: "y", spacing: 8 }), group({ by: "slice" }))
  .mark(rect({ x: "x", x2: "x2", fill: "alpha" }))
  .render(a, { axes: true, legend: false });

// (b) thick lines: solid on the core, dashed across each end's 95% range
layer({ w: 420, h: 240 }, [
  chart(activityCores)
    .flow(
      spread({ by: ROWS, dir: "y", spacing: 34 }),
      scatter({ by: "x", x: "x" })
    )
    .mark(line({ along: "x", stroke: BAR, strokeWidth: 26 })),
  chart(activityEnds)
    .flow(
      spread({ by: ROWS, dir: "y", spacing: 34 }),
      group({ by: "end" }),
      scatter({ by: "x", x: "x" })
    )
    .mark(
      line({ along: "x", stroke: BAR, strokeWidth: 26, strokeDasharray: "3 3" })
    ),
]).render(b, { axes: true });
```

Precomputed by hand: each fading end cut into 12 slices, each with
P(started) × P(not yet ended) at its middle, under normal start and end times;
the solid core from `start + 2 sd` to `end − 2 sd`; and each end's 95% range.
Two approximations: the fade is stepped, not a smooth gradient, and it is a
white-to-blue color scale, not opacity. A rect's `opacity` is a constant, not a
channel, so it cannot follow a column, and on a white page the color scale looks
the same. Panel (b) draws bars as thick lines, because `rect` has no dash option.
The two panels' rows do not line up exactly, and the last row in (b) sits on
the axis.

**Proposed (A)**

```js
// activities: [{ activity, start, startSd, end, endSd }]. start and end are
// Dist<Instant>; their sd columns are durations.
const start = dist.normal({ mean: "start", sd: "startSd" });
const end = dist.normal({ mean: "end", sd: "endSd" });

// (a) fade: the opacity at t is P(start <= t <= end)
// new: gradient with two Dist ends
chart(activities)
  .flow(spread({ by: ROWS, dir: "y" }))
  .mark(gradient({ x: start, x2: end, fill: BAR }));

// (a, noise form) the same fade from 50 overlaid draws
chart(activities)
  .flow(
    spread({ by: ROWS, dir: "y" }),
    sample({ n: 50 }),
    overlay({ by: "draw" })
  )
  .mark(rect({ x: start, x2: end, fill: BAR }));

// (b) dashed: a solid core, and a dashed box over each end's 95% interval
chart(activities)
  .flow(spread({ by: ROWS, dir: "y" }))
  .mark(
    layer([
      rect({ x: start.quantile(0.975), x2: end.quantile(0.025), fill: BAR }),
      // new: a dash option on rect
      rect({
        dims: { x: start.interval(0.95) },
        fill: "none",
        stroke: BAR,
        strokeDasharray: "3 3",
      }),
      rect({
        dims: { x: end.interval(0.95) },
        fill: "none",
        stroke: BAR,
        strokeDasharray: "3 3",
      }),
    ])
  );
```

```python
start = dist.normal(mean="start", sd="startSd")
end = dist.normal(mean="end", sd="endSd")

# (a) fade
chart(activities).flow(spread(by=ROWS, dir="y")).mark(
    gradient(x=start, x2=end, fill=BAR)
)

# (a, noise form)
chart(activities).flow(spread(by=ROWS, dir="y"), sample(n=50), overlay(by="draw")).mark(
    rect(x=start, x2=end, fill=BAR)
)

# (b) dashed
chart(activities).flow(spread(by=ROWS, dir="y")).mark(
    layer(
        [
            rect(x=start.quantile(0.975), x2=end.quantile(0.025), fill=BAR),
            # new: a dash option on rect
            rect(
                dims={"x": start.interval(0.95)},
                fill="none",
                stroke=BAR,
                stroke_dasharray="3 3",
            ),
            rect(
                dims={"x": end.interval(0.95)},
                fill="none",
                stroke=BAR,
                stroke_dasharray="3 3",
            ),
        ]
    )
)
```

**Proposed (B)**

```js
// B: the data is draws, one row per (activity, draw), and the fade is a stat
// over each group's rows.
chart(activityDraws)
  .flow(spread({ by: ROWS, dir: "y" }))
  .mark(gradient({ x: "start", x2: "end", fill: BAR }));
```

**New pieces needed**

- `dist.normal` over a time measure, which makes `start` a `Dist<Instant>` with
  a duration `sd`. The unit check should require `sd` to be a duration when
  `mean` is an instant. This touches the time datatype work (#256).
- `gradient` with two Dist ends (`x` and `x2`). `types.md` keeps both forms:
  `gradient` takes rect's box channels, and any of them may hold a Dist. One
  Dist end follows its density. Two ends give P(start ≤ t ≤ end).
- The noise form (`sample` + `overlay` + plain `rect`) gives the same fade from
  draws, and needs no new mark. Each draw is drawn at `max(0.05, 1/50)`, so
  0.05. It shows that one opacity mechanism can serve both modes, as the notes
  on this paper suggest. Stacked alpha is not a linear sum (see `noise.md`),
  so its fade is close to P(start ≤ t ≤ end), not equal to it.
- For (b): `d.interval(0.95)` fills a `dims` entry, the one span form the IR
  already has. `rect({ x: d.interval(0.95) })` is an error, because `x` is one
  position. `rect` also needs `strokeDasharray`.
- Overlap: `gradient` with two Dist ends desugars into today's slices with a
  computed color, up to the stepping. The lift form desugars into
  `sample` + `overlay` over existing marks. A real opacity channel on `rect`
  (or a gradient fill) is needed for a smooth fade.
