# Croissant Sampling: removing the hand-sampled grids (#1332)

- Today the croissant stories sample a function by hand: `gridOf`, a hand-written `kde`, and `quantileRows` over 1000 rows, with a grid range and size picked per story.
- Proposed: a new flow step, `sweep({ v: x.range() })`, makes a row for every v in an interval. The rows spec that draws an area today runs on them unchanged: `scatter` places each row and `ribbon` connects them. The connecting mark picks which v to draw, to half a pixel, so the spec never names a grid, an `n` or a step.
- `ribbon({ h: x.density() })` (approach B) is short for that spec. Because the curve is still rows, `stack` adds two curves at each x with no new machinery.

## Recommendation

Candidate C: rows over a continuous index, made by a new operator, `sweep`, with B as its short form. `repeat` stays discrete. A count and an interval make rows that allow different operators after them, so they are two operators, not one with two argument types. After `sweep`, the spec is the one GoFish already uses for an area: `scatter` places each row, `stack` works inside each x slice, and `ribbon` or `line` connects the slices. Prototype renders of the normal croissant, two stacked densities, a plain function and a spiral use the real `scatter`, `stack`, `ribbon` and `line` on an emulated continuum: the v values were picked adaptively before layout. The wall is the real version, where the connector lays out each slice on demand as it samples; no prototype does that yet. The runner-up is `repeat` given an interval. A continuous `scatter` was weighed and rejected.

## Relation to #980

This applies #980 to the croissant; it does not compete with it. #980 (first-class distributions: the data holds a Dist; draws and quantile levels are rows made by `repeat(n, ...)`; slab and interval are user code, not marks) already says that binning a Dist key by `Bin.quantiles` cuts it at its quantiles. `sweep` is the continuous counterpart of #980's `repeat`, and it takes #980's intervals as arguments (`sweep({ v: x.interval(0.95) })`). B answers #980's open question of curve summaries in channels, as the short form of C. A is #980's `densityCurve` helper, which is C over a finite grid. Nothing adds a mark or reopens a #980 decision, and all three delete `quantileRows` (#1231). The continuous-type section ties into #980's scales tab, which says a density's "per" must name the field it is spread over.

Artifact: https://claude.ai/artifact/Fh12g89z1cChzAqpQZ8mGH. The #980 proposal: https://claude.ai/artifact/QKR9jSHs1LWCtjp25bFuBq.

Renders are real GoFish renders. B uses a throwaway prototype node, `packages/gofish-graphics/src/ast/shapes/_prototypeFnCurve.tsx`, which `stories/proposals/CroissantSamplingB.stories.tsx` drives. `fnCurve({ f, range })` stands in for `ribbon({ h: x.density() })`. In both approaches the cut layer emulates an exact Dist cut with 2000 exact quantile rows.

## Rules

1. The function lives in the data as a Dist: `dist.normal({ mean, sd })` over parameter columns, or `field(x).kde()` over a group's rows (#980).
2. `sweep({ v: [a, b] })` replaces each row with a continuum of rows, one for every v in [a, b], with the index in column `v`. The interval can be a pair or an interval value: a Dist's `x.range()`, or #980's `x.interval(0.95)`. `repeat(n, "draw")` stays the discrete operator (#980).
3. A continuum goes through the operators that work one slice at a time: `scatter({ x: "v" })` places each row, `stack` works inside each slice, `derive` maps each row, and `ribbon` or `line` connects the slices. The connector picks the v it draws, to half a pixel, through the axis scales and the coordinate transform. Sampling has no spelling, so there is no knob to model.
4. An operator that counts or lists its rows is an error after `sweep`: `spread`, `sort`, `count`, and a mark drawn once per row (rect, circle, text). After `repeat` they are legal. This is why the two are two operators.
5. A channel reads a Dist at the index: `x.density("v")`, `x.cdf("v")`, the way #980's `x.quantile("p")` reads a level. With no argument, `ribbon({ h: x.density() })` is short for the whole spec over `x.range()` (approach B).
6. A bare Dist in a position channel still means its blurred limit (#980). That uses the Dist's own weight, where draws pile up. A continuum weighs every v the same. The two are different, so they get different spellings.
7. Cuts and dots read the Dist exactly: `x.bin(Bin.quantiles(n))` cuts at the quantile function, and `x.median()` is exact. `quantileRows` is deleted (#1231). No new mark.

## Rows over a continuous index

Renders use the real `scatter`, `stack`, `ribbon` and `line` on an emulated continuum (`continuumIndex` in `stories/proposals/croissantDist.ts` picks the v values adaptively before layout).

### Normal croissant, curve from a continuum

**Works: rendered with the real ribbon.**

![](img/c-normal.png)

The curve layer is the rows spec after `sweep`. The cuts and dots still come from the Dist, as in every approach. The short form at the bottom of the code is B.

```js
// sweep makes a row for every v in the Dist's range; the rest is the rows spec
chart(params)
  .flow(sweep({ v: x.range() }), scatter({ x: "v" }))
  .mark(
    ribbon({ h: x.density("v") })
      .name("density")
      .hidden()
  );

// B is short for exactly that
chart(params).mark(ribbon({ h: x.density() }).name("density").hidden());
```

Runner-up, `repeat` over an interval:

```js
// Runner-up: repeat, given an interval instead of a count
chart(params)
  .flow(derive(repeat(x.range(), "v")), scatter({ x: "v" }))
  .mark(
    ribbon({ h: x.density("v") })
      .name("density")
      .hidden()
  );
```

Python:

```python
(
    chart(params)
    .flow(sweep(v=x.range()), scatter(x="v"))
    .mark(ribbon(h=x.density("v")).name("density").hidden())
)
```

### Two densities, stacked at each x

**Works: stack adds inside each slice.**

![](img/c-stack.png)

`scatter({ by: "v" })` makes one slice per v, and `stack` puts g on top of f inside each slice. The sum f(v) + g(v) comes from adding two numbers, the way `stack` always does, so functions need no addition of their own. This is the structure of the stacked area and streamgraph stories today, with a continuum in place of the rows. In the render g is scaled by 0.6.

```js
// one row per curve: { series, mean, sd }; x = dist.normal({ mean: "mean", sd: "sd" })
chart(params)
  .flow(
    sweep({ v: [-4, 4] }),
    scatter({ by: "v", x: "v" }),
    stack({ by: "series", dir: "y" })
  )
  .mark(ribbon({ h: x.density("v"), fill: "series" }));
```

Runner-up, `repeat` over an interval:

```js
// Runner-up: repeat, given an interval
chart(params)
  .flow(
    derive(repeat(interval(-4, 4), "v")),
    scatter({ by: "v", x: "v" }),
    stack({ by: "series", dir: "y" })
  )
  .mark(ribbon({ h: x.density("v"), fill: "series" }));
```

Python:

```python
(
    chart(params)
    .flow(
        sweep(v=[-4, 4]),
        scatter(by="v", x="v"),
        stack(by="series", dir="y"),
    )
    .mark(ribbon(h=x.density("v"), fill="series"))
)
```

### A plain function

**Works.**

![](img/c-sin.png)

No Dist, so the interval is written as a pair. The row accessor `(d) => wave(d.v)` is a tentative spelling; in Python a lambda over a row needs the callback bridge.

```js
const wave = (v) => Math.sin(v) + 0.3 * Math.sin(7 * v);

chart([{}])
  .flow(
    sweep({ v: [0, 4 * Math.PI] }),
    scatter({ x: "v", y: (d) => wave(d.v) })
  )
  .mark(line());
```

Runner-up, `repeat` over an interval:

```js
// Runner-up: repeat, given an interval
chart([{}])
  .flow(
    derive(repeat(interval(0, 4 * Math.PI), "v")),
    scatter({ x: "v", y: (d) => wave(d.v) })
  )
  .mark(line());
```

Python:

```python
def wave(v):
    return math.sin(v) + 0.3 * math.sin(7 * v)


(
    chart([{}])
    .flow(sweep(v=[0, 4 * math.pi]), scatter(x="v", y=lambda d: wave(d["v"])))
    .mark(line())
)
```

### A parametric curve

**Works.**

![](img/c-spiral.png)

The index t is neither x nor y. `sweep` gives it a column of its own, and `scatter` places each row at (x(t), y(t)). A continuous `scatter`, which uses its index set as the x axis, has no spelling for this curve.

```js
// The index t is not a position: x and y are both functions of it
chart([{}])
  .flow(
    sweep({ t: [0, 6 * Math.PI] }),
    scatter({ x: (d) => d.t * Math.cos(d.t), y: (d) => d.t * Math.sin(d.t) })
  )
  .mark(line());
```

Runner-up, `repeat` over an interval:

```js
// Runner-up: repeat, given an interval
chart([{}])
  .flow(
    derive(repeat(interval(0, 6 * Math.PI), "t")),
    scatter({ x: (d) => d.t * Math.cos(d.t), y: (d) => d.t * Math.sin(d.t) })
  )
  .mark(line());
```

Python:

```python
(
    chart([{}])
    .flow(
        sweep(t=[0, 6 * math.pi]),
        scatter(
            x=lambda d: d["t"] * math.cos(d["t"]),
            y=lambda d: d["t"] * math.sin(d["t"]),
        ),
    )
    .mark(line())
)
```

### Which operator makes the continuum

- **A new operator, `sweep({ v: [a, b] })` (recommended)**: A count and an interval make rows of different types. After `repeat(n)`, `spread`, `sort`, counting and a mark per row are legal. After `sweep`, they are errors, and a connector samples the rows instead. So the two differ in what may follow them, not just in their argument. Two operators is the honest factoring, and they share no case worth building through one mechanism: a zero-width interval is one point, which nobody would write as a sweep.
- **Extend `repeat`: `repeat(interval, "v")` (runner-up)**: One name and Mathematica's precedent: `Table[expr, {i, imin, imax}]` steps by 1, and `Plot[f, {x, xmin, xmax}]` samples the same iterator form continuously. But then the type of what `repeat` returns depends on its argument, and an error after it (a `spread` after a continuum) points at a later step. `repeat` should feel discrete.
- **Continuous `scatter`: `scatter({ x: interval })` (rejected)**: Makes the rows and places them in one step. `scatter` today only places rows it is given. So the continuous form would overlap `sweep` + `scatter` over most of its range, which api-design.md calls the wrong factoring. It also cannot spell a parametric curve, and its stack needs an implicit `by`.

```js
// Rejected: a continuous scatter makes rows and places them in one step
chart(params)
  .flow(scatter({ x: x.range() }))
  .mark(ribbon({ h: x.density() }));

// Runner-up: one operator, repeat, over a count or an interval
derive(repeat(1000, "draw")); // rows 0 to 999
derive(repeat(interval(0, 1), "p")); // a row for every p in [0, 1]

// Recommended: two operators, because their outputs allow different operators after them
derive(repeat(1000, "draw")); // a list: spread, sort, count, per-row marks are legal
sweep({ p: [0, 1] }); // a continuum: those are errors; connectors sample it
```

```js
// The same step under each candidate name
sweep({ v: x.range() }); // recommended
continuum({ v: x.range() }); // runner-up name
interval({ v: x.range() }); // clashes with #980's interval
domain({ v: x.range() }); // clashes with Domain and every scale domain
span({ v: x.range() }); // clashes with a channel's { min, max } span

// It reads well with #980's own interval: sweep the central 95%
sweep({ v: x.interval(0.95) });
```

| Name                                  | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Note                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `sweep` (recommended)                 | No GoFish export or option uses it, on main or on the #980 branch. It appears only as local variables in arc code and in prose: `centralAngle` is the polar "total angular sweep", and the animation clock input documents "one sweep of the domain", the same meaning. A verb that says the index moves over the whole interval. Python: `sweep(v=[a, b])`.                                                                                                                                                                                                                                                                            | no clash; no visualization precedent checked |
| `continuum`                           | Free everywhere. A noun, and long; it names the result, not the step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | no clash; runner-up name                     |
| `interval` (Josh's suggestion)        | Clashes in the uncertainty vocabulary. On the #980 branch `x.interval(0.95)` is a central interval of a Dist (25 uses in its proposal docs and stories), `interval({ x, levels })` is the user function that draws one, after ggdist's interval geom, and `centralIntervals` is a helper. Main already calls a `dims` entry `{ min, max }` an interval. The operator could take the value constructor's place (`interval({ v: [0, 2 * Math.PI] })`), but then `interval(...)` would make rows in a flow and a span everywhere else. Better: interval is the type of `sweep`'s argument, so `sweep({ v: x.interval(0.95) })` reads well. | serious clash                                |
| `domain`                              | TikZ's `domain=a:b` and Mathematica's `{x, a, b}` iterator are the precedent. But GoFish already has the `Domain` family (`Domain.discrete(levels)`, with `Domain.continuous` planned as the type of an interval of numbers), plus every scale domain and the domain-inference pass.                                                                                                                                                                                                                                                                                                                                                    | serious clash                                |
| `span`                                | Main uses span for a channel's `{ min, max }` extent (`xMin`/`xMax` in scatter's `dims`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | clash                                        |
| `sample`, `range`, `along`            | Taken: #980's `value.sample`, `x.range()`, and the `along` option of `line` and `ribbon`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | rule out                                     |
| Precedent for a continuous index step | Mathematica's `{x, xmin, xmax}` iterator. TikZ `domain` (initially -5:5) with `samples` (initially 25). Vega-Lite `sequence` (`step` defaults to 1, `stop` exclusive) and polars `linear_space` (requires `num_samples`) are discrete. Wilkinson's GPL puts a density in a channel instead: `line(position(density.normal(x)))`.                                                                                                                                                                                                                                                                                                        | verified                                     |

## The croissants in the short form (B)

### Croissant of the standard normal

![](img/b-normal.png)

The front-page chart under B. There is no grid and no comment about [-3, 3]. The curve comes from `x.density()`, drawn while laying out. The cells end at the normal's quintiles, and the dots sit at its 0.1, 0.3, 0.5, 0.7 and 0.9 quantiles.

```js
const params = [{ mean: 0, sd: 1 }];
const x = dist.normal({ mean: "mean", sd: "sd" });

croissant(params, x, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE }).render(
  container,
  {
    w: 480,
    h: 200,
    axes: { x: true, y: false },
  }
);
```

Today:

```js
// The standard normal on [-4, 4]: wide enough that the outer quantile rows
// are accurate (on [-3, 3] the missing tails move the outer cells' medians).
const normalGrid = gridOf((x) => normPdf(x), -4, 4, 401);

croissant(normalGrid, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE }).render(
  container,
  {
    w: 480,
    h: 200,
    axes: { x: true, y: false },
  }
);
```

### Penguin body mass, a kernel density estimate

![](img/b-penguin-body-mass.png)

`field(x).kde()` is #980's smoothed sample: one Dist from the group's rows. Its cdf is exact (a sum of normal cdfs), so the ten cuts need no grid either.

```js
croissant(penguins, field("Body Mass (g)").kde()).render(container, {
  w: 520,
  h: 220,
  axes: { x: { title: "Body mass (g)" }, y: false },
});
```

Today:

```js
const masses = penguins.map((p) => p["Body Mass (g)"]).filter((v) => v != null);
const massGrid = gridOf(kde(masses).f, 2200, 6800, 461);

croissant(massGrid).render(container, {
  w: 520,
  h: 220,
  axes: { x: { title: "Body mass (g)" }, y: false },
});
```

### Ridgeline of Seattle highs by month

![](img/b-ridgeline.png)

The `flatMap` that built 12 grids by hand is gone. `temp` is one smoothed Dist per month, because `kde()` folds the rows of the group it runs in. Each month's curve is drawn from its own Dist.

```js
const temp = field("temp_max").kde(); // one smoothed Dist per month, from its days

chart(weather, { w: 520, axes: { x: { title: "Daily high (°C)" }, y: false } })
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
      chart().mark(ribbon({ h: temp.density() }).name("density").hidden()),
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
  )
  .render(container);
```

Today:

```js
// One density per month of Seattle's daily highs, each on its own grid from
// three bandwidths below the month's lowest high to three above its highest.
const monthlyDensity = months.flatMap((month, m) => {
  const highs = seattleWeather
    .filter((d) => new Date(d.date).getUTCMonth() === m)
    .map((d) => d.temp_max);
  const { f, bw } = kde(highs);
  const lo = Math.min(...highs) - 3 * bw;
  const hi = Math.max(...highs) + 3 * bw;
  return gridOf(f, lo, hi, 161).map(({ x, pdf }) => ({
    month,
    temp_max: x,
    pdf,
  }));
});

chart(monthlyDensity, {
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
      chart()
        .flow(scatter({ x: "temp_max" }))
        .mark(ribbon({ h: "pdf" }).name("density").hidden()),
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
  )
  .render(container);
```

### The croissant helper the three stories share

The helper takes the rows and the Dist. The grid, `normPdf`, `kde`, `quantileRows` and the `scatter` that placed grid rows all leave user code.

```js
// The croissant of a Dist x over the rows of data: the density, unseen, then in each of its
// n equal-probability cells the density's area cut to the cell, and a dot at the cell's median.
const croissant = (data, x, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart(data).mark(ribbon({ h: x.density() }).name("density").hidden()),
  ]).relate(({ density }) => [
    chart(data)
      .flow(partition({ by: x.bin(Bin.quantiles(n)), dir: "x" }))
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: x.median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);
```

Python:

```python
def croissant(data, x, n=10, fill=FILL, stroke=STROKE):
    return layer([chart(data).mark(ribbon(h=x.density()).name("density").hidden())]).relate(
        lambda density: [
            chart(data)
            .flow(partition(by=x.bin(Bin.quantiles(n)), dir="x"))
            .mark(
                layer(
                    [
                        intersect([density, region(inset=3)], fill=fill, stroke=stroke, stroke_width=2),
                        circle(cx=x.median(), cy=6, r=3, fill=stroke),
                    ]
                )
            )
        ]
    )


x = dist.normal(mean="mean", sd="sd")
croissant([{"mean": 0, "sd": 1}], x, n=5, fill=PAPER_FILL, stroke=PAPER_STROKE)

croissant(penguins, field("Body Mass (g)").kde())
```

Today:

```js
const normPdf = (x, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

// n evenly spaced grid rows { x, pdf } of f over [lo, hi].
const gridOf = (f, lo, hi, n) =>
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });

// A Gaussian kernel density estimate of values, with Silverman's bandwidth.
const kde = (values) => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = 1.06 * sd * n ** -0.2;
  return {
    bw,
    f: (x) => values.reduce((s, v) => s + normPdf(x, v, bw), 0) / n,
  };
};

const croissant = (grid, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart(grid)
      .flow(scatter({ x: "x" }))
      .mark(ribbon({ h: "pdf" }).name("density").hidden()),
  ]).relate(({ density }) => [
    chart(grid)
      .flow(
        derive((rows) =>
          quantileRows(rows, { x: "x", density: "pdf", n: 1000 })
        ),
        partition({ by: field("x").bin(Bin.quantiles(n)), dir: "x" })
      )
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: field("x").median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);
```

## Stress tests for the short form

### Coordinates: a density in polar

**Works in B.**

![](img/b-polar.png)

The same single pass maps x ↦ (x, f(x)), then the coordinate transform, so the curve bends with no extra code. The prototype draws a sum of two von Mises bumps. It found one bug in the existing resampler: like d3's, it never splits a segment whose two ends land on the same pixel, and a closed curve from 0 to 2π starts and ends at the same point. Starting from 16 segments instead of 1 fixes it.

```js
// Wind directions as a density in polar: the same resampler bends it.
const direction = dist.mixture(
  [
    dist.vonMises({ mu: Math.PI / 3, kappa: 4 }),
    dist.vonMises({ mu: (4 * Math.PI) / 3, kappa: 8 }),
  ],
  { weights: [0.7, 0.3] }
);

chart([{}], { coord: Coord.polar(), w: 300, h: 300 }).mark(
  ribbon({ h: direction.density(), fill: FILL, stroke: STROKE })
);
```

### A plain function over a given domain

**Works in B.**

![](img/b-sin.png)

No Dist, so no default range: `fn` takes its domain. The y domain (−1.3 to 1.3) is found before layout by sampling in data space, invisibly.

```js
// A plain function: no Dist, so its domain is given.
const wave = fn((x) => Math.sin(x) + 0.3 * Math.sin(7 * x), {
  x: [0, 4 * Math.PI],
});

chart([{}], { w: 420, h: 160 }).mark(line({ y: wave }));
```

### A parametric curve

**Works in B.**

![](img/b-parametric.png)

A graph is the special case x(t) = t, so the prototype is written for t ↦ (x(t), y(t)) and draws a spiral with the same resampler. The spelling, one `fn` read by two channels, is tentative.

```js
// A parametric curve: one function of t gives both channels.
const spiral = fn((t) => ({ x: t * Math.cos(t), y: t * Math.sin(t) }), {
  t: [0, 6 * Math.PI],
});

chart([{}], { w: 300, h: 300 }).mark(line({ x: spiral.x, y: spiral.y }));
```

### A narrow kernel, where sampling shows

**Works in B.**

![](img/b-narrow-bandwidth.png)

A 25 g bandwidth. B picks about 250 points along the curve, packed where it bends. A fixed 101 points (ggplot2's default) visibly flattens these peaks; 512 matches B (see approach A below).

```js
const mass = field("Body Mass (g)").kde({ smoothing: 25 });

chart(penguins, { w: 520, h: 60 }).mark(ribbon({ h: mass.density() }));
```

### Stacking two curves

**B alone: wall; as C: works.**

![](img/b-stack.png)

![](img/b-stack-from-rows.png)

Top: B alone under `stack`, with a function node per curve. `stack` moves each child's whole box, so the second curve sits on the first one's baseline, not on its curve. Bottom: the same two curves as rows, stacked at each x. C keeps the rows, so its stacked card above works. B is safe as the short form of C, not as a separate node.

```js
// B: stack moves whole boxes, so g sits on f's box, not on f's curve
stack({ dir: "y" }, [ribbon({ h: f.density() }), ribbon({ h: g.density() })]);
```

```js
// Rows (approach A): stack adds at each x
chart(rows) // { x, series, y }: f and g sampled on one grid
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "series", dir: "y" }))
  .mark(ribbon({ h: "y", fill: "series" }));
```

## Answers for the short form

**Spelling.** `ribbon({ h: x.density() })` for an area, `line({ y: x.cdf() })` for a CDF, and `line({ y: fn(f, { x: [lo, hi] }) })` for a plain function. A function in one channel sets the mark's extent on the other axis. It sits beside #980's rule because `x.density()` is a function, not a Dist. A bare `x` in a position channel still means the blurred limit.

**Extent.** With no rows, the function's own domain sets the x span: a Dist's default range (the 0.001 to 0.999 quantiles of a normal, as ggdist; a smoothed sample's data plus 3 bandwidths, as seaborn), or `fn`'s given domain. The prototype uses this. ggplot2 uses the axis range instead, which can only work when another layer sets the axis first. Whether to union the two, and whether any override is needed, are open decisions.

**Domain before pixels.** The y scale needs the curve's maximum before layout knows pixels. Where the Dist knows its mode (a normal's peak is at its mean), it is exact. Otherwise the prototype samples 512 points in data space and refines the best one by golden-section search. This is invisible. A spike narrower than 1/512 of the range could be missed. The mark sees the true peak while drawing, so it could warn instead of drawing past the axis.

**The resampler claim.** It holds, with three caveats. `adaptiveResamplePath` takes any `{ transform }`, so x ↦ coord(scale(x, f(x))) is just a composed transform. (1) Its source must be in pixels, since it forces a split above 10 source units. The prototype passes the curve's parameter scaled to its length on screen. (2) It never splits a segment whose ends coincide, so a closed curve must start as several segments (fixed, see the polar card). (3) It tests one midpoint per segment, so a feature narrower than about 10 px can fall between samples, as in d3. For `intersect`, the mark also needs its outline before coordinates, so the prototype samples once for the outline and once, composed with the coordinates, for paint. In linear coordinates the two passes are the same.

**What is lost without rows.** The hover datum is the mark's own row (the Dist's parameters), not a sample point. `selectAll` finds one curve, not its sample points, which are only how it was drawn. Operators that need rows (`stack`, a label at the peak) have nothing to read. Under C the rows are back. Hover is the slice at the pointer. `selectAll` finds the curve, which is the continuum's connector. `stack` works inside each slice. `partition` cuts the index interval into sub-intervals. A cell's median follows the half-weight rule, given a weight (see the decisions).

## A: a finite grid

### A: the same spec over a finite grid

![](img/normal.png)

![](img/narrow.png)

Same picture, from #980's `densityCurve` helper with written-out defaults (`n: 512`, `range: x.range()`). Rows keep every row operator working, `stack` included. But a data step runs before the pixel scale exists, so it cannot be screen-aware, and `n` and `range` are part of the spec. This is the general pattern for sampling a function in a data step: a parameter grid plus an expression (matplotlib's `linspace`, ggplot2's `stat_function`, pgfplots' `domain`/`samples`, #980's `repeat(n, { level: "p" })` + `value.quantile("p")`). Under C, A is just `repeat` over a finite grid, so it needs no helper of its own.

A's resolution on the narrow kernel: 101 evenly spaced points (top), 512 (middle), and screen-adaptive (bottom).

```js
// A: the density as rows, made by #980's data helper; n and range default from the Dist
chart(data)
  .flow(
    derive((rows) => densityCurve(rows, x)),
    scatter({ x: "v" })
  )
  .mark(ribbon({ h: "density" }).name("density").hidden());

// written out
densityCurve(rows, x, { n: 512, range: x.range() });
```

### Why the cuts must come from the Dist (both approaches)

![](img/drift.png)

Today's spelling over a short grid, [-2.2, 2.2]. The brown dots are today's medians from `quantileRows`; the red dots are the exact ones. The outer brown dots sit at ±1.22, not ±1.28, because the cut-off tails are missing. The story's [-3, 3] warning is the same error, smaller (±1.275). A grid sets both the look and the cuts, so picking a range for looks moves the cuts.

```js
// Proposed: the cuts and dots come from the Dist, so no grid can move them.
croissant(params, dist.normal({ mean: "mean", sd: "sd" }), { n: 5 });
// cells end at x.quantile(0.2), x.quantile(0.4), ...; dots at x.quantile(0.1), x.quantile(0.3), ...
```

Today:

```js
// Today: the cuts and dots come from the grid, so a short grid moves them.
const grid = gridOf((x) => normPdf(x), -2.2, 2.2, 45);
croissant(grid, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE });
```

## A continuous value type?

C is rows over a continuous type: a continuum is the interval with uniform weight, rows are point masses, and a Dist is a weight that totals 1. Everything B loses without rows is an ordinary operation on a continuous value. chebfun ("computing with functions") is the closest precedent: it stores a function adaptively, to about machine precision, and overloads MATLAB's vector commands, so `sum` is a definite integral and `max`, `roots` and `cumsum` work on the function. GoFish would need far less, only what the table below lists.

| Lost without rows | Operation                | Field                              | Measure                                            | Rows                 |
| ----------------- | ------------------------ | ---------------------------------- | -------------------------------------------------- | -------------------- |
| Hover datum       | evaluate at a point      | f(x₀)                              | density and cdf at x₀                              | the row at x₀        |
| `selectAll`       | the value itself         | one curve                          | one Dist                                           | the rows             |
| `partition`       | restrict to an interval  | f on [a, b]                        | the measure cut to [a, b] (mass = its probability) | the rows in the cell |
| `stack`           | pointwise add            | f + g (same unit)                  | the sum of the measures (a weighted mixture)       | add per x            |
| sum               | integrate                | ∫f dx, in a new unit (degree-days) | the total weight (1 for a Dist)                    | Σ weights            |
| median            | where half the weight is | not defined: a field has no weight | the 0.5 quantile                                   | the median row       |
| y domain          | max                      | max f                              | max density                                        | max value            |

```js
const mass = field("Body Mass (g)").kde(); // a measure: weight spread over x
const pdf = mass.density(); // a function of x: probability per gram

pdf.at(4200); // evaluate: the hover datum at the pointer
mass.bin(Bin.quantiles(5)); // restrict: partition cuts it into five measures
mass.median(); // half the weight
mass.total(); // integrate: 1 for a Dist, the count for rows
pdf.max(); // the y domain
pdf.plus(otherPdf); // pointwise add: what stack needs
```

Two kinds of continuous value behave differently. A **field** has a value at each x: temperature over a day, `sin`, or a pdf drawn as a height. It adds pointwise, and its median means nothing. A **measure** is an amount spread over x: a Dist, a population density. Its sum is an integral, and its median is where half the weight lies. Rows of plain numbers are a discrete measure, a point mass of weight 1 at each value. That is the "weight spread over x" rule for medians from the chat, so rows and continuous values can share `partition`, sum and median. A Dist is a measure whose total is 1. (Field here is the GIS sense of the word. GoFish's `field()` is the column accessor, so the API would need another name.)

One type or two? Probably one: a function of x whose unit decides. A density's unit is "per unit of x" (probability per gram), so integrating it over x gives an amount, and sum and median are legal. A field's unit has no "per x", so its median is an error and its integral changes unit. This is #980's scales tab again: "per" must name the field the amount is spread over, and the same unit tells a warp to scale a density by the inverse slope. The CF conventions for climate data draw the same line with their `cell_methods`. `point` is the default for an intensive quantity and `sum` for an extensive one. A measure is the density of a field times dx, so one representation carries both, and the unit says which.

Precedent:

- **chebfun**: Adaptive Chebyshev approximation of a function, to about machine precision. Overloads MATLAB's vector commands: `sum` is a definite integral, plus `max`, `roots`, `cumsum`, `mean` (checked on the chebfun site).
- **Mathematica `InterpolatingFunction`**: What `NDSolve` returns: a function object that is evaluated, differentiated and integrated like a formula (from memory; not re-checked for this page).
- **GIS: field and object views**: Rasters model a field (a value everywhere), and vector features model objects. The two have different operations, as field and measure do here (from memory; not re-checked for this page).
- **CF conventions, `cell_methods`**: Each value says what it stands for over its cell: `point` (the default for an intensive quantity), `sum` (for an extensive one), `mean`, `maximum`, `median` and more (checked in Appendix E).
- **sympy `Piecewise`**: A symbolic piecewise function, which `integrate` handles piece by piece: the restricted pieces a partition would make (from memory; not re-checked for this page).

## Precedent: a function as a mark input

| System                  | What the user writes              | Range                                 | Resolution                                                                                                                       | Screen-aware                      | Checked                      |
| ----------------------- | --------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------- |
| Mathematica `Plot`      | `Plot[f[x], {x, lo, hi}]`         | user                                  | `PlotPoints` (initial even samples) then up to `MaxRecursion` adaptive subdivisions; both `Automatic` by default                 | no: adapts in its own space       | verified, reference page     |
| Plots.jl                | `plot(f, xmin, xmax)`             | user                                  | `PlotUtils.adapted_grid`: 31 even points, refined up to 7 times where curvature is large; applied after the axis scale functions | no: data space                    | verified, source             |
| Makie                   | `lines(0..10, sin)`               | the interval                          | `convert_arguments(::AbstractInterval, ::Function)` calls the same `adapted_grid`                                                | no: data space                    | verified, source             |
| ggplot2 `geom_function` | `geom_function(fun = dnorm)`      | the scale (`xlim` to override)        | `n = 101`, even                                                                                                                  | no                                | verified, reference page     |
| function-plot           | `{ fn: "x^2" }`                   | the viewport                          | interval arithmetic picks where to sample; re-evaluated whenever the scale changes                                               | yes                               | verified, docs page          |
| d3-geo resample         | `projection.precision(...)`       | n/a                                   | adaptive to a pixel tolerance; the model for `adaptive-resampling.ts`                                                            | yes                               | GoFish source                |
| seaborn `kdeplot`       | `kdeplot(x=...)`                  | data ± `cut=3` bandwidths             | `gridsize=200`                                                                                                                   | no                                | round 1 survey               |
| ggdist `stat_slab`      | `aes(xdist = dist_normal(0, 1))`  | 0.001 to 0.999 quantiles (`p_limits`) | `n = 501`                                                                                                                        | no; intervals exact from the dist | round 1 survey               |
| Vega-Lite `density`     | `{ density: "x", extent, steps }` | data extent, or `extent`              | adaptive, 25 to 200 steps                                                                                                        | partly                            | round 1 survey               |
| Desmos                  | type `y = sin(x)`                 | the viewport                          | adaptive, redone on pan and zoom                                                                                                 | yes                               | not verified: no public docs |

Taking a function as a mark input is common (Mathematica, Plots.jl, Makie), and all of them sample adaptively without a knob in the usual case. But they adapt in data space at conversion time. Only the viewport systems (function-plot, Desmos) and d3-geo adapt on the screen. B does both: the function is in the spec, and it is sampled in pixels through the coordinate transform.

## Similar warts

- `stories/forwardsyntax/Croissant.stories.tsx`: three stories with `gridOf`, `kde` and `quantileRows`, and the Python port `tests/python-stories/forward-syntax/test_croissant.py`.
- `stories/lowlevel/NameScope.stories.tsx`: `NestedCallout` and `MedianTrend` sample normal pdfs on hand-written 81-point grids.
- `stories/lowlevel/ViolinPlot.stories.tsx` (gallery) uses `fast-kde`, and its Python port uses `scipy.stats.gaussian_kde`, so the two curves differ. A library `kde()` fixes that parity gap too.
- `apps/docs/docs/{js,python}/api/operators/derive.md` list `quantileRows`; both go with #1231.
- Not this wart: `RidgelineChart.stories.tsx` bins counts by hand (a histogram), and the `Math.sin` generators in other stories are made-up datasets.

## Issues cited

- #1332: this issue: remove the `gridOf` sampling wart from the croissant
- #980: distributions as first-class data; this proposal fits its design
- #1231: replace `quantileRows` with first-class distributions
- #544: croissant charts, merged in #1229
- #830: interaction as data: hover and zoom, where evaluating a function matters

## Open decisions

1. Name of the continuous operator: `sweep` (recommended), `continuum`, or Josh's `interval` despite its clash with #980's `x.interval(p)` and `interval({ x, levels })`? (`domain` and `span` clash too.)
2. Real implementation of a continuum: the connector lays out each slice on demand as it samples. Which operators can lay out one slice at a time? `stack` and `scatter` can; `spread`, `sort` and `count` cannot and become errors. Is that list right?
3. Short form: is `ribbon({ h: x.density() })` (B) worth keeping as sugar for the continuum spec over `x.range()`? And how does a plain function or a parametric curve read the index: `(d) => wave(d.v)`, or a column expression?
4. Extent of a stack: each Dist's own range, or one shared interval (as the stacked card writes it)? Where one curve has no row at some v, is it 0?
5. Median weights: every value in a cell is weight spread over x, and the median is where the pooled weight reaches half. Is a cut cell's weight 1 or its probability (0.2)? Does a continuum over a Dist's range carry the Dist's weight, or uniform weight? With uniform weight, `field("v").median()` is a cell's midpoint, not the Dist's median.
6. Ridgeline: cut each month at the quantiles of its smoothed curve (as drawn), or at the raw days' quantiles? They differ, and the slices are drawn on the smoothed curve.
7. Continuous type: one type whose unit decides field or measure, or two types? And does it come before or after #980's Dist?
8. Default range of a smoothed sample: its data plus 3 bandwidths each side (seaborn's `cut`), or cut at the data's ends (ggdist's bounded density)?
9. An outer cell runs to minus or plus infinity. Should its region stop at the chart's x domain (as the prototype does), or is an infinite cell an error?
10. Should the mark warn when the curve's true peak, found while drawing, is above the y domain found before layout?
