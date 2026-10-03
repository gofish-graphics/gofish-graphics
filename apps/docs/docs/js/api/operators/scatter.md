---
order: 40
---

# scatter

Positions children at per-group means (when `by` is given) or per-item (when `by` is omitted).

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.chart(locations, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle({ r: 8 }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
scatter({ by?, x?, y?, xMin?, xMax?, yMin?, yMax?, dims?, alignment?, overlap? })
```

## Parameters

::: gofish-ref scatter
:::

At least one of `x`, `y`, the `xMin`/`xMax` pair, or the `yMin`/`yMax` pair is required.

## Placing by axis name with `dims`

`x` and `y` mean the first and second axis in any coordinate space. To use the
names the enclosing coordinate space declares, put them in `dims`: a plain
value is the point, like `x`, and `{ min, max }` is the span, like
`xMin`/`xMax`.

```ts
// Under polar(): the same as scatter({ by: "id", x: "bearing", y: "distance" })
.flow(scatter({ by: "id", dims: { theta: "bearing", r: "distance" } }))
.mark(circle({ r: 4 }))

// Under geo(): the same as scatter({ by: "name", x: "lon", y: "lat" })
.flow(scatter({ by: "name", dims: { lon: "lon", lat: "lat" } }))
```

A scatter only places its children, so a `size` inside `dims` is an error; size
the mark instead. Placing an axis twice, such as `x` together with
`dims.theta`, is an error too. The two ends of a span may come from either
spelling (`xMin` with `dims: { x: { max: "hi" } }`), but one end without the
other is an error. Each value in `dims` is read like its top-level
counterpart: a point like `x`, a `min` like `xMin`. The circle's `r` above is
its radius, not the polar axis: axis names only appear as keys of `dims`.

## Keeping dots apart with `overlap`

When a field places only one axis, every child sits on one line on the other
axis, at the scatter's `alignment`. Dots with close values then cover each
other. `overlap` moves each child along that free axis so the children no
longer overlap. A strategy only ever moves children along the free axis: each
child keeps the position its field gives it on the data axis, which `scatter`
alone places. You make the strategy with a function call.

There are two strategies. They differ in what sets the width of the cloud.

- `separate({ padding? })` keeps the dots apart. In data order, each dot
  moves along the free axis to the nearest free spot, so no two dots overlap.
  The counts set the width exactly: where many dots share a value, the cloud
  grows tall. The result is a beeswarm. `padding` is the number of pixels kept
  between neighboring dots. The default is 0.
- `jitter({ randomness?, smoothing?, padding?, seed? })` spreads the dots
  inside an outline. The outline is wide where many dots share a part of the
  data axis and narrow where few do, so it shows the shape of the
  distribution. The dots are placed inside it and may touch.

::: gofish

```js
gf.chart(
  penguins.filter((p) => p["Body Mass (g)"] !== null),
  { axes: true }
)
  .flow(
    gf.spread({ by: "Species", dir: "y", spacing: 16 }),
    gf.scatter({
      x: "Body Mass (g)",
      alignment: "middle",
      overlap: gf.separate({ padding: 1 }),
    })
  )
  .mark(gf.circle({ r: 3, fill: "Species" }))
  .render(root, { w: 560, h: 320 });
```

:::

`separate` places the dots the same way as Observable Plot's `dodge`. It is
not called `dodge` because in ggplot2 and plotnine `position_dodge` means
grouped bars, which is `spread` in GoFish. It is not called `beeswarm`
because that word names a family of layouts: greedy ones like this one,
force-directed ones, and packed ones. The name comes from the separation
constraints of constraint layout, as in WebCoLa and VPSC.

The same data with `jitter()`:

::: gofish

```js
gf.chart(
  penguins.filter((p) => p["Body Mass (g)"] !== null),
  { axes: true }
)
  .flow(
    gf.spread({ by: "Species", dir: "y", spacing: 16 }),
    gf.scatter({
      x: "Body Mass (g)",
      alignment: "middle",
      overlap: gf.jitter(),
    })
  )
  .mark(gf.circle({ r: 3, fill: "Species" }))
  .render(root, { w: 560, h: 320 });
```

:::

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
  changes the outline's shape but not its total size. `smoothing: Infinity`
  makes the outline flat, a band of fixed width. With `randomness: "uniform"`,
  that is classic jitter, as in seaborn's `stripplot` or ggplot's
  `position_jitter`.
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
circle [`pack`](/js/api/operators/pack) uses.

The cloud is as tall as its dots need. It does not shrink to fit the space it
is given, so a dense beeswarm can grow past it. To make it smaller, use smaller
dots or less padding. `jitter` does not make it smaller: its outline also
grows with the counts, and it leaves extra room so the dots can spread.

Some cases are errors:

- `overlap` when both `x` and `y` come from fields, because then no axis is
  free.
- `overlap` inside a coordinate space that is not linear, such as `polar()`.
  The strategies measure distances in the layout frame, and a polar space
  bends that frame, so dots could still overlap on screen. See
  [#1002](https://github.com/gofish-graphics/gofish-graphics/issues/1002).

## Example

```ts
.flow(scatter({ by: "species", x: "bill_length", y: "flipper_length" }))
.mark(rect({ w: 8, h: 8, rx: 4 }))

// Histogram with range form: each rect spans its bin in data space
.flow(derive(bin("rating")), scatter({ xMin: "start", xMax: "end" }))
.mark(rect({ h: "count" }))
```

## Discrete scatter and translation

When `x` or `y` is categorical, `scatter` uses discrete point placement: each
group is placed at the center of its allotted position. Use this for cases that
need center placement without treating child edges as a band layout.

If you need a fixed offset around the arranged scatter, chain
`.translate({ x?, y? })` on the operator instead of putting that value in
`scatter({ x, y })`. The `x` and `y` options on `scatter` are placement
channels; `.translate()` is an outer pixel translation that preserves the
scatter-computed axis.

```ts
chart(seafood, { coord: clock() })
  .flow(
    scatter({
      by: "lake",
      x: "lake",
      w: 2 * Math.PI,
      axes: { x: false, y: true },
    }).translate({ y: 50 }),
    stack({ by: "species", dir: "y", label: false })
  )
  .mark(rect({ w: 0.1, h: "count", fill: "species" }));
```

In that example, `x: "lake"` chooses the discrete angular centers and
`.translate({ y: 50 })` adds the radial offset. Writing `y: 50` inside
`scatter(...)` would instead mean "use scatter's y-channel semantics."
