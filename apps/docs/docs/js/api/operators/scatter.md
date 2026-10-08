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
// Under Coord.polar(): the same as scatter({ by: "id", x: "bearing", y: "distance" })
.flow(scatter({ by: "id", dims: { theta: "bearing", r: "distance" } }))
.mark(circle({ r: 4 }))

// Under Coord.geo(): the same as scatter({ by: "name", x: "lon", y: "lat" })
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
alone places. You make the strategy with a function call in the `Overlap`
family, which is also the module `gofish-graphics/overlap`.

There are two strategies. They differ in what sets the width of the cloud.

- `Overlap.separate({ padding? })` keeps the dots apart. In data order, each dot
  moves along the free axis to the nearest free spot, so no two dots overlap.
  The counts set the width exactly: where many dots share a value, the cloud
  grows tall. The result is a beeswarm. `padding` is the number of pixels kept
  between neighboring dots. The default is 0.
- `Overlap.noise({ randomness?, smoothing?, padding?, seed? })` spreads the dots
  inside an outline. The outline is wide where many dots share a part of the
  data axis and narrow where few do, so it shows the shape of the
  distribution. The dots are placed inside it and may touch.

Two more functions make `noise` with other defaults. Any option you pass
replaces the default.

| Function           | Same as                                                         | Looks like                         |
| ------------------ | --------------------------------------------------------------- | ---------------------------------- |
| `Overlap.noise()`  | `Overlap.noise()`                                               | an outline that follows every pile |
| `Overlap.sina()`   | `Overlap.noise({ smoothing: "silverman" })`                     | a violin filled with dots          |
| `Overlap.jitter()` | `Overlap.noise({ randomness: "uniform", smoothing: Infinity })` | classic jitter in a flat band      |

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
      overlap: gf.Overlap.separate({ padding: 1 }),
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

The same data with `Overlap.noise()`:

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
      overlap: gf.Overlap.noise(),
    })
  )
  .mark(gf.circle({ r: 3, fill: "Species" }))
  .render(root, { w: 560, h: 320 });
```

:::

And with `Overlap.sina()`, which gives each species a smooth violin outline:

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
      overlap: gf.Overlap.sina(),
    })
  )
  .mark(gf.circle({ r: 3, fill: "Species" }))
  .render(root, { w: 560, h: 320 });
```

:::

### How the outline is made

Each dot adds a small bell-shaped bump to the outline, centered on its own
value. The bump is tallest at the dot and fades smoothly to zero on both
sides. The outline is the sum of all the bumps. So a dot near a point on the
data axis counts a lot there, a dot a little farther away counts less, and a
dot far away counts almost nothing. Only each bump is bell-shaped. The sum
follows the data: it can have several peaks, lean to one side, or show a
spike where many dots share one value.

Each bump is made in two steps.

1. The first step estimates where the data is. Each dot is blurred by the
   `smoothing` option. This width is called the bandwidth. A narrow
   bandwidth keeps small spikes in the data. A wide one blurs them into a
   broad hill. Changing it changes the shape of the outline but not its
   total size. At the two ends of the data, part of this blur would fall
   past the last dot, where there are no dots. The outline makes up for that
   part, so the ends are not drawn too thin.
2. The second step gives each dot its own size. Each dot is blurred again by
   a bump about as wide as the dot. Nothing is made up at the ends for this
   step, because it is the dot itself, not missing data. So a lone dot sits
   on the line, at the end of the data as well as in the middle.

With `smoothing` 0, only the second step blurs the dots. A smaller blur than
that would let dots with nearly equal values draw on top of each other.

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
  - a number, 0 or more. The default for `noise` is 0, which means no
    smoothing beyond the size of the dots. The outline follows the data
    closely, and a pile of equal values shows as a spike. A truly zero blur
    would let dots with nearly equal values draw on top of each other, so
    each bump is always at least as wide as a dot, and the smoothing widens
    it from there.
  - `"silverman"`, the default for `sina`. The bandwidth is worked out from
    the data with Silverman's rule of thumb, `0.9 · min(sd, IQR / 1.34) ·
n^(-1/5)`, separately for each group. This is the rule that ggforce's
    `geom_sina` and R's `density()` use, so the outline is the curve a violin
    plot draws. Spread out data gets wider bumps, and more data gets narrower
    ones. When a group has fewer than two dots, or every dot in it has the
    same value, the rule gives 0, so each bump is just the size of a dot.
  - `Infinity`, the default for `jitter`. Every bump is flat, so the outline
    is a band of fixed width. With `randomness: "uniform"`, that is classic
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
circle [`pack`](/js/api/operators/pack) uses.

The cloud is as tall as its dots need. It does not shrink to fit the space it
is given, so a dense beeswarm can grow past it. To make it smaller, use smaller
dots or less padding. `noise` does not make it smaller: its outline also
grows with the counts, and it leaves extra room so the dots can spread.

Some cases are errors:

- `overlap` when both `x` and `y` come from fields, because then no axis is
  free.
- `overlap` inside a coordinate space that is not linear, such as `Coord.polar()`.
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
chart(seafood, { coord: Coord.clock() })
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
