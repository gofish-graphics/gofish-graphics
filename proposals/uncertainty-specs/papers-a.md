# Papers A: uncertainty examples from recent IEEE VIS papers

Prototype stories: `packages/gofish-graphics/stories/proposals/uncertainty/PapersA.stories.tsx`
(title `Proposals/Uncertainty/Papers A`). Data and helpers, with a seeded
mulberry32 RNG, Box–Muller normals and a Marsaglia–Tsang gamma for χ² and
Dirichlet draws: `papers-a-data.ts` next to it. Each render below is the story's
PNG. The Python blocks were formatted with black (run through `uvx black`).

`// new:` marks a spelling that the shared syntax sheet does not cover. The
list at the end collects them.

### Bootstrap regression spaghetti

Forty observed points drawn crisp, with 39 regression lines, one for each
bootstrap resample of the rows, overlaid at low opacity. Thirty-nine draws give a
95% pointwise band by the paper's coverage rule, (n−1)/(n+1). Source: Petek,
Nabergoj, Štrumbelj, "A General Approach to Visualizing Uncertainty in
Statistical Graphics" (https://arxiv.org/abs/2508.00937, Fig. 7).

![](img/bootstrap-spaghetti.png)

**Today**

```js
chart(bootPoints)
  .flow(scatter({ by: "id", x: "x", y: "y" }))
  .mark(circle({ r: 3, fill: "#222" }))
  .layer(
    chart(bootLines)
      .flow(group({ by: "draw" }), scatter({ by: "x", x: "x", y: "y" }))
      .mark(line({ stroke: "#d62728", strokeWidth: 1.5, opacity: 0.12 }))
  );
```

Precomputed by hand: the 39 resamples and an OLS fit of each, stored as two
endpoints per line. The opacity 0.12 is picked by hand.

**Proposed (A)**

```js
chart(points)
  .flow(scatter({ by: "id", x: "x", y: "y" }))
  .mark(circle({ r: 3, fill: "#222" }))
  .layer(
    chart(points)
      .flow(
        resample({ n: 39 }), // or resample({ coverage: 0.95 })
        overlay({ by: "draw" }),
        derive(fitLine), // a user function; runs once per draw
        scatter({ by: "x", x: "x", y: "y" })
      )
      .mark(line({ stroke: "#d62728" }))
  );
```

```python
chart(points).flow(scatter(by="id", x="x", y="y")).mark(circle(r=3, fill="#222")).layer(
    chart(points)
    .flow(
        resample(n=39),  # or resample(coverage=0.95)
        overlay(by="draw"),
        derive(fit_line),  # a user function; runs once per draw
        scatter(by="x", x="x", y="y"),
    )
    .mark(line(stroke="#d62728"))
)
```

Approach B reads the same: `resample` already makes draws as rows, so there is
no Dist field here in either approach.

**New pieces needed**

- `resample({ n })` / `resample({ coverage })`: new. It does not desugar into an
  existing operator. A `derive` can do the same with a user function, but then
  the draw key and its "shared draws" property are not known to the system.
  `coverage` is not in the `resample` descriptor of `types-sketch.ts`. It is
  kept here with the same rule as `sample`'s, n = (1 + c) / (1 − c), because
  both make n draws and the rule is the paper's.
- `overlay({ by: "draw" })`: new. Here the overlap is already free, because
  `scatter` puts lines with the same x and y in the same place. What `overlay`
  adds is the opacity rule, `max(0.05, w / Σw)` (here `max(0.05, 1/39)`, so
  0.05), and the declaration that `draw` is a sample index. Its layout is
  `time.sequence`'s superimposed layout with no clock (see `noise.md`), so it
  adds no layout of its own. Over a `scatter` it is still close to
  `group({ by: "draw" })` plus a hand-set `opacity`; the difference is the rule
  and the type.
- No regression transform exists in GoFish. The spelling uses a user function in
  `derive`, which the sheet's rule 2 runs once per draw. A built-in fit helper
  would be a separate decision.

### Weighted multiple-forecast lines

Nine forecast lines of a temperature anomaly over 30 months, each line's opacity
set by its model weight (0.1 to 1). Source: Zou et al., "Seeing Through the
Forecast Clutter" (https://arxiv.org/abs/2608.00433). The paper's stimuli were
not visible in the fetched text, so the data and styling are a stand-in that
follows the described design (9 lines, opacity weights from 0.1 to 1).

![](img/weighted-forecasts.png)

**Today**

```js
// Line opacity takes a number, not a field, so each model is its own layer.
const [first, ...rest] = forecastWeights.map((weight) =>
  chart(forecasts.filter((d) => d.weight === weight))
    .flow(scatter({ by: "month", x: "month", y: "temp" }))
    .mark(line({ stroke: "#1f4e79", strokeWidth: 2, opacity: weight }))
);
rest.reduce((c, layer) => c.layer(layer), first);
```

Precomputed by hand: the nine trajectories. The chart has to split the table by
model in JavaScript, because `line`'s `opacity` cannot read a field today.

**Proposed (A)**

```js
chart(forecasts, { schema: { temp: { draws: "model", weight: "weight" } } })
  .flow(
    overlay({ by: "model" }), // opacity follows the record's weight
    scatter({ by: "month", x: "month", y: "temp" })
  )
  .mark(line({ stroke: "#1f4e79", strokeWidth: 2 }));
```

```python
chart(forecasts, schema={"temp": {"draws": "model", "weight": "weight"}}).flow(
    overlay(by="model"),  # opacity follows the record's weight
    scatter(by="month", x="month", y="temp"),
).mark(line(stroke="#1f4e79", stroke_width=2))
```

**Proposed (B)**

```js
chart(forecasts)
  .flow(
    overlay({ by: "model", weight: "weight" }), // weight given on the step
    scatter({ by: "month", x: "month", y: "temp" })
  )
  .mark(line({ stroke: "#1f4e79", strokeWidth: 2 }));
```

**New pieces needed**

- The column record's `draws` and `weight` keys, and `overlay`: new. The first
  draft wrote `rvar("temp", { draw: "model", weight: "weight" })` and a
  `sample()` with no `n`. With the record, the rows are already the draws, so
  no `sample()` is needed: `sample()` with no `n` keeps every stored draw,
  which is the identity on a draws column. A and B now differ only in where
  the weight is written, the record or the step. The step's `weight` is the
  override for a key that is not a draw key.
- The weight-to-opacity rule: `types.md` settles it as `max(min, w / Σw)`,
  which gives 1/n for equal weights. The first draft here used
  `w / max(w)`, so the heaviest line was opaque, as in the paper, which maps
  weights linearly into 0.1 to 1. Under the settled rule the nine weights sum
  to about 5, so the heaviest line is drawn at about 0.2, and the chart is
  fainter than the paper's. The paper's look is a per-line opacity, not a
  share of the draws. That needs `line({ opacity: "weight" })` (below), and
  the choice is listed as an open decision. A linewidth option (the paper's
  other condition) is also open.
- Overlap check: B is exactly "a per-group opacity". If `line({ opacity })`
  accepted a field, B would be `group({ by: "model" })` plus
  `line({ opacity: "weight" })`, with no new operator. That is a small library
  change, and it is the honest overlap: weighted overlay is a data-driven
  opacity plus the 1/n default.

### VMC "aggregate per draw"

A histogram of the mean of each of 200 posterior-predictive replicated datasets
(50 values each), with a vertical line at the observed data's mean. Source: Guo,
Kale, Kay, Hullman, "VMC: A Grammar for Visualizing Statistical Model Checks"
(https://arxiv.org/abs/2408.16702).

![](img/aggregate-per-draw.png)

**Today**

```js
chart(replicates)
  .flow(
    // The per-draw fold, by hand: one row per replicate, its mean.
    derive((rows) =>
      Object.values(groupBy(rows, "draw")).map((g) => ({
        mean: meanBy(g, "y"),
      }))
    ),
    partition({ by: field("mean").bin(Bin.step(0.05)), dir: "x" })
  )
  .mark(rect({ h: field("mean").count(), fill: "#9ecae1", inset: 0.5 }))
  .layer(
    chart(observedMeanRule)
      .flow(scatter({ by: "count", x: "mean", y: "count" }))
      .mark(line({ stroke: "#08306b", strokeWidth: 2, curve: Curve.linear() }))
  );
```

Precomputed by hand: the 200 replicates (a posterior draw of (μ, σ), then 50
values), the observed mean, and the rule as two points from count 0 to 22.
GoFish has no rule mark, and a `rect` with a literal height did not span the
y axis in data units, so the rule is a two-point line.

**Proposed (A)**

```js
chart(replicates, { schema: { y: { draws: "draw" } } })
  .flow(
    group({ by: "draw" }),
    summarize({ mean: field("y").mean() }), // new: one row per group
    partition({ by: field("mean").bin(Bin.step(0.05)), dir: "x" })
  )
  .mark(rect({ h: field("mean").count(), fill: "#9ecae1", inset: 0.5 }))
  // new: rule mark
  .layer(
    chart(observed).mark(rule({ x: field("y").mean(), stroke: "#08306b" }))
  );
```

```python
chart(replicates, schema={"y": {"draws": "draw"}}).flow(
    group(by="draw"),
    summarize(mean=field("y").mean()),  # new: one row per group
    partition(by=field("mean").bin(Bin.step(0.05)), dir="x"),
).mark(rect(h=field("mean").count(), fill="#9ecae1", inset=0.5)).layer(
    chart(observed).mark(rule(x=field("y").mean(), stroke="#08306b"))
)
```

**Proposed (B)**

```js
chart(replicates)
  .flow(
    group({ by: "draw" }),
    summarize({ mean: field("y").mean() }),
    partition({ by: field("mean").bin(Bin.step(0.05)), dir: "x" })
  )
  .mark(rect({ h: field("mean").count(), fill: "#9ecae1", inset: 0.5 }))
  .layer(
    chart(observed).mark(rule({ x: field("y").mean(), stroke: "#08306b" }))
  );
```

**The step choice.** VMC's "aggregate" grouping is a fold inside each draw,
then a picture of the folded values. I spell it as two ordinary steps:
`group({ by: "draw" })` then `summarize({ ... })`, a new general step that
collapses each group to one row of aggregates. After it, `mean` is a plain
column with one row per draw, so the histogram is the existing `partition` plus
`count`. I did not use a Dist-level spelling such as "the row mean of a Dist
column is a Dist" (functor map over shared draws). `types.md`'s one-summary rule
settles the naming conflict the design note's section 5c flags: `.mean()`
always summarizes the group's folded Dist, so here, inside one draw's group, it
is that replicate's mean.

**New pieces needed**

- `summarize`: new, and not uncertainty-specific. GoFish has no step that turns
  each group into one row; today it is a `derive` with lodash. It overlaps with
  aggregate channels (`field("y").mean()` in a mark), but those cannot feed a
  later `partition`, so the overlap is partial.
- `rule`: new mark (a full-span line at one x or y). Today it is a two-point
  `line`.
- The fold is only valid with shared draws (a draw is a whole replicate). The
  record's `draws: "draw"` declares this, in A and B alike. Without it nothing
  checks it.
- A and B differ only by the schema record. The first draft's A also had an
  `rvar` and a `sample()`, which the record makes unneeded.
- `summarize` takes its columns flat, `summarize({ mean: ... })`, as dplyr's
  `summarize(mean = ...)` and polars' `agg(mean=...)` do. The descriptor in
  `types-sketch.ts` names the record `columns`. Whether the wire wraps the
  flat form is open.

### jk-CDF band

Fifty Normal CDF curves, one for each posterior draw of (μ, σ) from a Normal
model of 15 observations, drawn faint over the empirical CDF step line. Source:
Piccolotto et al., "Adaptive Uncertainty Visualization With jk-Plots", VIS 2026
short paper
(https://ieeevis.org/year/2026/program/content/87e9069f-c5dd-411a-9cbf-5730077c7a18,
OSF https://osf.io/wzv2g).

![](img/jk-cdf.png)

**Today**

```js
chart(jkCdfDraws)
  .flow(group({ by: "draw" }), scatter({ by: "x", x: "x", y: "p" }))
  .mark(line({ stroke: "#3182bd", strokeWidth: 1, opacity: 0.15 }))
  .layer(
    chart(ecdf)
      .flow(scatter({ by: "x", x: "x", y: "p" }))
      .mark(line({ stroke: "#111", strokeWidth: 1.5, curve: Curve.step() }))
  );
```

Precomputed by hand: the 50 posterior draws of (μ, σ) (flat prior, χ² for σ),
each CDF evaluated on a grid of 61 x values, and the empirical CDF as sorted
step points.

**Proposed (A)**

```js
// posterior: [{ draw, mu, sigma }], one row per posterior draw
const model = dist.normal({ mean: "mu", sd: "sigma" }); // Dist<Dist<number>>

chart(posterior, {
  schema: { mu: { draws: "draw" }, sigma: { draws: "draw" } },
})
  .flow(sample({ n: 50 }), overlay({ by: "draw" }))
  .mark(cdf({ x: model, stroke: "#3182bd" })) // new: cdf mark
  .layer(
    // the empirical CDF of the observed rows
    chart(observations).mark(cdf({ x: "value", stroke: "#111" }))
  );
```

```python
# posterior: one row per posterior draw, columns draw, mu, sigma
model = dist.normal(mean="mu", sd="sigma")  # Dist[Dist[float]]

chart(posterior, schema={"mu": {"draws": "draw"}, "sigma": {"draws": "draw"}}).flow(
    sample(n=50), overlay(by="draw")
).mark(
    cdf(x=model, stroke="#3182bd")  # new: cdf mark
).layer(
    chart(observations).mark(cdf(x="value", stroke="#111"))
)
```

**Proposed (B)** is not shown. The first draft sampled the inner normal into
rows with a constructor form, `sample({ value: dist.normal(...), n: 500, as: "x" })`.
`types.md` drops that form: a `dist.*` channel is A's spelling in the synthesis,
and `sample({ n })` lifts it. Pure B, with no Dist type, would still need 500
rows per draw.

**New pieces needed**

- `cdf` as a mark: new. The sheet says "`cdf` as `line` over `field(d).cdf()` if
  needed", but a CDF is a curve over a grid of x values, not one value per row,
  so it does not fit a `line` over rows. I chose a consume mark `cdf({ x: d })`.
  Given a plain column, it draws the empirical CDF of the group's rows as a step
  line, which also covers the observed layer.
- Nested `dist.normal({ mean: "mu", sd: "sigma" })` over columns declared as
  draws: the sheet's `rvar` nesting, with the draw key moved to the column
  record. Its parameters are Dists, so it is a Dist<Dist<number>>. The outer
  `sample({ n: 50 })` picks 50 of the stored posterior draws and keeps their
  ids, so they stay joint. The inner Normal stays a Dist that `cdf` consumes
  exactly. This is the clearest case for Approach A.
- Pure B cannot keep the inner Normal, so it has to sample it (500 values per
  draw). The curves become ECDFs, which are noisy and cost 25,000 rows. This is
  where A and B read and behave differently.

### jk pie

A jk pie: concentric rings in polar coordinates, one ring per posterior draw of
three category probabilities (20 draws from Dirichlet(1 + counts), counts
7, 5, 3), stacked by category around each ring. Same source as above.

![](img/jk-pie.png)

**Today**

```js
chart(pieDraws, { coord: Coord.clock(), axes: false })
  .flow(
    spread({ by: "draw", dir: "y", spacing: 1, y: 30 }),
    stack({ by: "category", dir: "x" })
  )
  .mark(rect({ w: "p", h: 6, fill: "category" }));
```

Precomputed by hand: the 20 Dirichlet draws as a long table. I used
`Coord.clock()` (12 o'clock start, clockwise, like a pie) rather than
`Coord.polar()`; the layout is the same. `y: 30` leaves a hole in the middle.

**Proposed (A)**

```js
// counts: [{ category, count }], the observed counts
// new: dist.dirichlet, one joint distribution over the rows
const probs = dist.dirichlet({ alpha: field("count").plus(1) });

chart(counts, { coord: Coord.polar(), axes: false })
  .flow(
    sample({ n: 20 }),
    spread({ by: "draw", dir: "y", spacing: 0 }),
    stack({ by: "category", dir: "x" })
  )
  .mark(rect({ w: probs, h: 6, fill: "category" }));
```

```python
# counts: one row per category, columns category, count
probs = dist.dirichlet(alpha=field("count").plus(1))  # new: one joint over the rows

chart(counts, coord=Coord.polar(), axes=False).flow(
    sample(n=20),
    spread(by="draw", dir="y", spacing=0),
    stack(by="category", dir="x"),
).mark(rect(w=probs, h=6, fill="category"))
```

**Proposed (B)**

```js
// pieDraws: [{ draw, category, p }], posterior draws as rows
chart(pieDraws, { coord: Coord.polar(), axes: false })
  .flow(
    spread({ by: "draw", dir: "y", spacing: 0 }),
    stack({ by: "category", dir: "x" })
  )
  .mark(rect({ w: "p", h: 6, fill: "category" }));
```

B is today's chart.

**New pieces needed**

- `dist.dirichlet`: new. It is a joint over the rows of a group (one draw is a
  whole probability vector), not a distribution per cell. The sheet's
  constructors are all per cell. A joint constructor says "these rows share
  draws", which is what makes `stack` within a draw legal: each ring sums to 1.
- No new operator. Stack within draw and spread across draws already compose in
  polar, as the render shows. The rule "stacking by draw on the measured axis is
  a type error" is not hit, because the stack is by category.
- The brief calls this Dist&lt;Dist&lt;T&gt;&gt;: a Dirichlet is a distribution over
  categorical distributions. In A, the `w` channel lifts the outer level and
  each ring shows one inner categorical. A `prob()`-style consume mark is not
  needed.

### Probit-scaled CCDF for ordinal outcomes

Rating levels on x and Φ⁻¹ P(y ≥ k) on y, one line per posterior draw (40) and
condition (2), from a cumulative-probit model. The median rating is where the
lines cross 0. Source: Sarma, "Adapting CCDF Plots for Visualizing Ordinal
Regression Results" (https://arxiv.org/abs/2607.01747). The figure images were
not in the fetched text, so axis styling is a guess.

![](img/probit-ccdf.png)

**Today**

```js
chart(ccdfDraws, {
  color: Color.palette({ Control: "#7f7f7f", Treatment: "#d95f02" }),
})
  .flow(group({ by: "line" }), scatter({ by: "k", x: "k", y: "z" }))
  .mark(
    line({
      stroke: "condition",
      strokeWidth: 1,
      opacity: 0.3,
      curve: Curve.linear(),
    })
  )
  .layer(
    chart(probitZero)
      .flow(scatter({ by: "k", x: "k", y: "z" }))
      .mark(
        line({ stroke: "#111", strokeDasharray: "4 3", curve: Curve.linear() })
      )
  );
```

Precomputed by hand: the posterior draws, the CCDF, the probit transform
(z = μ*c − τ*{k−1}), a `line` key joining condition and draw (a group takes one
key), and the zero rule as two points. Approximations: the y axis shows z
values, not probabilities, because GoFish has no probit scale. The x axis is
continuous, so it has ticks at 2.2, 2.4 and so on. The x axis runs from 2 to 5
because P(y ≥ 1) = 1 is +∞ on the probit scale.

**Proposed (A)**

```js
// epred: [{ condition, draw, k, p }], p = P(rating = k) in that draw
const rating = dist.categorical({ level: "k", p: "p" }); // Dist<Dist<Ordinal>>

chart(epred, {
  schema: { p: { draws: "draw" } },
  color: Color.palette({ Control: "#7f7f7f", Treatment: "#d95f02" }),
  axes: { y: { scale: Scale.probit() } }, // new: a scale family, on the axis
})
  .flow(sample({ n: 40 }), group({ by: "condition" }), overlay({ by: "draw" }))
  // new: ccdf mark; new: rule mark
  .mark(ccdf({ x: rating, stroke: "condition" }))
  .layer(rule({ y: 0, strokeDasharray: "4 3" }));
```

```python
# epred: columns condition, draw, k, p with p = P(rating = k) in that draw
rating = dist.categorical(level="k", p="p")  # Dist[Dist[Ordinal]]

chart(
    epred,
    schema={"p": {"draws": "draw"}},
    color=Color.palette({"Control": "#7f7f7f", "Treatment": "#d95f02"}),
    axes={"y": {"scale": Scale.probit()}},  # new: a scale family, on the axis
).flow(sample(n=40), group(by="condition"), overlay(by="draw")).mark(
    ccdf(x=rating, stroke="condition")
).layer(
    rule(y=0, stroke_dasharray="4 3")
)
```

**Proposed (B)**

```js
chart(epred, {
  schema: { k: { weight: "p" } }, // new: a weight with no draw key
  color: Color.palette({ Control: "#7f7f7f", Treatment: "#d95f02" }),
  axes: { y: { scale: Scale.probit() } },
})
  .flow(group({ by: "condition" }), overlay({ by: "draw" }))
  .mark(ccdf({ x: "k", stroke: "condition" }))
  .layer(rule({ y: 0, strokeDasharray: "4 3" }));
```

**New pieces needed**

- `ccdf` mark: new, the complement of the `cdf` mark above. On an ordinal `T`
  it draws one point per level, joined by a line.
- `dist.categorical({ level, p })`: new. It builds one categorical from the rows
  that share every other key (here condition and draw), with `level` naming the
  ordered outcome. With `p` declared as draws it is Dist&lt;Dist&lt;Ordinal&gt;&gt;,
  like the jk-CDF.
- By the one-fold rule, a group of rows whose values are weighted is already
  that categorical: the rows of one (condition, draw) group, with `k` weighted
  by `p`, fold to the same Dist as `dist.categorical({ level: "k", p: "p" })`.
  So B's spelling is not a second mechanism, and `dist.categorical` across rows
  may not be needed at all. B writes the weight in the column record, as
  `types.md` does for draws, and drops the mark's `weight` option. A `weight`
  key with no `draws` key means the rows are weighted support points. This is
  a choice made here; `types.md` shows `weight` only beside `draws`.
- The probit axis: a scale acts on every mark on its axis (design note section
  4), so it belongs on the axis, not on `ccdf`. GoFish has no scale family, so
  `Scale.probit()` is a placeholder spelling in the strategy-family form. It
  would show probability tick labels (0.1, 0.5, 0.9 at their z positions). A
  scale family is its own issue, not part of #980.
- `rule`: the same new mark as in the VMC example.
- In B, `ccdf({ x: "k" })` over weighted rows is a weighted ECDF over the
  group's rows. It needs no Dist constructor, and it is shorter. A buys only
  the check that `k` is ordered and that `mean()` on it is an error, and the
  record gives B that check too.

## Syntax choices the sheet did not cover

These are the spellings after reconciling with `types.md`.

- The draw key and the weight live in the column record:
  `schema: { temp: { draws: "model", weight: "weight" } }`. `rvar` is gone.
- `sample()` with no `n` keeps every stored draw of a draws column, so it is
  the identity there and the examples leave it out.
- `overlay` opacity is `max(min, w / Σw)`, `min` 0.05. `overlay({ by, weight })`
  stays as the override for a key that is not a draw key. The paper's
  `w / max(w)` look is an open decision.
- `resample({ coverage })` uses `sample`'s coverage rule.
- `summarize({ name: fieldExpr })`: a new general step, one row per group, with
  the columns flat.
- `rule({ x })` / `rule({ y })`: a new full-span reference line mark.
- `cdf({ x })` / `ccdf({ x })` as consume marks. Given a plain column, they
  draw the empirical CDF of the rows, weighted if the record has a `weight`.
- `dist.dirichlet({ alpha })` and `dist.categorical({ level, p })`: joint
  constructors over the rows of a group. A weighted fold covers
  `dist.categorical`.
- The probit scale is on the axis, `axes: { y: { scale: Scale.probit() } }`, a
  placeholder for a scale family that does not exist.
- A regression fit is a user function in `derive`; I did not add a built-in.

## Gaps found in today's GoFish

- `line({ opacity })` takes only a number, so weighted lines need one layer per
  weight.
- There is no rule mark. A `rect` with a literal `h` did not span the y axis in
  data units.
- There is no probit (or any nonlinear) y scale.
- `group` takes one key, so condition × draw needs a joined key column.
