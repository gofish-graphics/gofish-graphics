# Stacking baselines: render notes

Working notes for the stacking proposal. Every image in `img/` is a real GoFish render with today's API. Anything GoFish lacks (offsets, orders, sampling alignment, densities) is computed in `derive` with plain JS.

- Stories: `packages/gofish-graphics/stories/proposals/StackingBaselines.stories.tsx` (title `Proposals/Stacking Baselines`).
- Data and helpers: `packages/gofish-graphics/stories/proposals/stackingBaselines.ts`.
- Render one: `CAPTURE_ONE_PORT=3047 pnpm --filter @gofish/tests capture-one "Stacking Baselines/BWiggle"`. (The default port 3002 was taken by another session while I worked, so every story failed with `ERR_CONNECTION_REFUSED` until I set a port of my own.)
- Size: every chart is `w: 480, h: 260`, colored by series.

## Data

- `topics`: six series (Maps, Weather, Sports, Music, Film, Games) at x = 0..29. Each series is a small base plus one or two Gaussian bumps, so topics rise and fall (`SERIES` table, 6 lines).
- `topicsSigned`: the same with Weather and Games made negative, for the diverging offset.
- `sampled`: three series (Maps, Sports, Games) each measured at its own x. Maps every 1.0 (30 points), Sports every 1.5 starting at 0 (20 points, so it shares every other x with Maps), Games at 15 jittered x near 0.6, 2.6, 4.6, ... (a seeded random number generator). The values are the same bump functions read at those x.
- `coarse`: Maps, Sports and Games from `topics` at every 4th x (8 points), so the curve comparison has room to differ.
- `samples`: 130 values in three groups (a: 60 around 2; b: 40 around 5; c: 30, two modes at 3.5 and 8), seeded.

## The shared spec

All stacked renders use one spec. `stackRows` (in `derive`) adds each row's band interval `[y0, y1]`; one `scatter` places a slice per x, a second places each band by `yMin`/`yMax`; the ribbon joins each band's pieces. No GoFish `stack` is used.

```js
chart(rows, { w: 480, h: 260 })
  .flow(
    derive((rows) => stackRows(rows, { offset, order })),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c" }));
```

`stackRows` is about 90 lines with all six offsets and the order hook. Shared part (group by x, order each slice, stack from 0, lay out rows): about 40 lines. It sorts its output rows by series in input order, because the color scale assigns colors in order of first appearance: without the sort, the inside-out order recolored every series.

## Baselines (offsets)

Same data (`topics`), same order (data order). The ribbon's default curve (monotone over a continuous x) is kept.

| Image                   | Story             | Offset                                                                                 | Emulation                                                                                        | Local?                                                                                                                                            |
| ----------------------- | ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b-zero.png`            | `BZero`           | zero: each slice stacks up from 0                                                      | none beyond the shared stack                                                                     | **Local**: one slice is enough                                                                                                                    |
| `b-silhouette.png`      | `BSilhouette`     | d3 `stackOffsetSilhouette`: baseline = minus half the slice total                      | 1 line                                                                                           | **Local**                                                                                                                                         |
| `b-wiggle.png`          | `BWiggle`         | d3 `stackOffsetWiggle` (Byron and Wattenberg)                                          | about 17 lines                                                                                   | **Not local**: the baseline at x_j is a running sum over every step from the first x to x_j. Changing one early slice moves every later baseline. |
| `b-weighted-wiggle.png` | `BWeightedWiggle` | matplotlib `stackplot(baseline="weighted_wiggle")`                                     | about 18 lines, ported line by line from `lib/matplotlib/stackplot.py` (main branch, read 11-07) | **Not local**: a cumulative sum over x, as wiggle                                                                                                 |
| `b-expand.png`          | `BExpand`         | d3 `stackOffsetExpand`: each slice divided by its total                                | 2 lines                                                                                          | **Local**                                                                                                                                         |
| `b-diverging.png`       | `BDiverging`      | d3 `stackOffsetDiverging`: positives up from 0, negatives down from 0, in series order | 4 lines                                                                                          | **Local**                                                                                                                                         |

Notes on the offsets:

- d3's wiggle (`d3-shape/src/offset/wiggle.js`) ignores the spacing between x positions: every step counts the same. On unevenly spaced x it weights steps wrongly. My port keeps this.
- I wrote wiggle using each band's middle, `(y0 + y1) / 2`, rather than d3's inner loop. For a fixed order the two are the same sum. The middle form also reads an order that changes per x, which the per-x rank render needs.
- matplotlib's plain `wiggle` is not d3's: it is `-(Σ (m - 0.5 - i) y_i) / m` per slice, so it is local. Only its `weighted_wiggle` is the cumulative Byron and Wattenberg rule.
- The weighted wiggle render pushes the lower bands down where Games grows at the top (x 18 to 24). That is the formula as written: `below_size = total - stack + y/2` is the size above a band plus half the band.

Spec, per story: the shared spec with `offset` set (`"zero"`, `"silhouette"`, `"wiggle"`, `"weightedWiggle"`, `"expand"`, or `"diverging"` with `topicsSigned`).

## Orders (wiggle baseline)

| Image                      | Story              | Order                                                                                                                                       | Emulation                                                              | Local?                                                             |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `o-given.png`              | `OGiven`           | data order (same image as `b-wiggle.png`)                                                                                                   | 3 lines                                                                | no computation                                                     |
| `o-inside-out.png`         | `OInsideOut`       | d3 `stackOrderInsideOut`: sort series by the x of their peak, then add each to the bottom or the top, whichever is lighter                  | about 19 lines, port of `order/insideOut.js` and `order/appearance.js` | **Global**: needs every series' peak position and total over all x |
| `o-per-x-rank-area.png`    | `OPerXRankArea`    | re-sorted at each x, largest at the bottom; drawn as one ribbon per series                                                                  | 2 lines                                                                | **Local**                                                          |
| `o-per-x-rank-ribbons.png` | `OPerXRankRibbons` | the same order, drawn as pieces then connect (F5): a 7 px rect per band per x, and a translucent linear ribbon per series through the rects | 2 lines                                                                | **Local**                                                          |

Inside-out puts the series whose peaks come first in the middle, so the bands grow outward over time. Its legend keeps the data order for color; the stacking order, bottom to top, is Weather, Games, Music, Maps, Film, Sports.

The per-x rank area shows why a stacked area cannot change order: each band is one ribbon through its own pieces, so when its rank changes the ribbon leaps across the others and the bands overlap between x positions. The ribbon chart form draws the same order honestly: the rects are disjoint at each x, and the crossings happen in the gaps.

```js
// o-inside-out
chart(topics, { w: 480, h: 260 })
  .flow(
    derive((rows) =>
      stackRows(rows, { offset: "wiggle", order: orderInsideOut(rows) })
    ),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c" }));

// o-per-x-rank-area: the same with order: orderRankPerX

// o-per-x-rank-ribbons
chart(topics, { w: 480, h: 260 })
  .flow(
    derive((rows) =>
      stackRows(rows, { offset: "wiggle", order: orderRankPerX })
    ),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(rect({ w: 7, fill: "c" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(group({ by: "c" }))
      .mark(ribbon({ fill: "c", opacity: 0.45, curve: Curve.linear }))
  );
```

## Sampling alignment

Three series, each measured at its own x (`sampled`). All renders here use `Curve.linear` except the curve-order ones, so what is drawn is exactly the data's interpolant.

### `s-samples.png` (`SSamples`)

The raw samples as dots, to show the three sampling patterns.

```js
chart(sampled, { w: 480, h: 260 })
  .flow(group({ by: "c" }), scatter({ by: "x", x: "x", y: "y" }))
  .mark(circle({ r: 2.5, fill: "c" }));
```

### `s-naive.png` (`SNaive`): what today's flow does

**Broken, silently.** The rows are sorted by x first, as a careful user would. A slice is made per distinct x (54 of them), and the stack inside a slice stacks only the series that were measured at that exact x. Where Maps and Sports share an x (0, 3, 6, ...), Sports sits on Maps; at 1.5, 4.5, ... Sports is alone and starts at 0. So the Sports band is a sawtooth between 0 and the top of Maps. Games shares only x = 0 (a jittered value clamped to 0) with the others, so it starts as a thin sliver at y ≈ 1.8 and slides to the floor by x ≈ 3. No warning or error is printed.

```js
chart(sampledByX, { w: 480, h: 260 })
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
  .mark(ribbon({ h: "y", fill: "c", curve: Curve.linear }));
```

### `s-naive-unsorted.png` (`SNaiveUnsorted`)

The same spec on rows grouped by series (all Maps rows, then Sports, then Games). The ribbon now zigzags: Sports' path goes x = 0, 3, 6, ..., 27, then back to 1.5, 4.5, ... (read from the path's `d` in the captured HTML). **Finding:** a ribbon threads its pieces in the order the slices were made, which is the order each `by` value first appears in the data, not their order along x. The run order is the children order in `Connect` (`ast/graphicalOperators/connect.tsx`, around line 551 and the `mains` read just after it). On ordinary data every series has every x, so the first series fixes a sorted order and nobody notices.

### `s-union-linear.png` (`SUnionLinear`): ggplot2 `stat_align` style

**Works (emulated).** Each series becomes a function by linear interpolation between its samples (held flat before its first and after its last sample; this is my choice, `stat_align`'s end handling differs). Every series is read at the union of all x (54 positions), then stacked from 0. No slivers, no spikes.

Emulation: `linearFn` 12 lines, `alignUnion` 10 lines.

```js
chart(sampled, { w: 480, h: 260 })
  .flow(
    derive((rows) => stackRows(alignUnion(rows), {})),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c", curve: Curve.linear }));
```

### `s-boundary-functions.png` and `s-boundary-functions-plain.png` (`SBoundaryFunctions`, `SBoundaryFunctionsPlain`)

**Works, but not with ribbon: polygons.** Each boundary is `B_k(x) = f_1(x) + ... + f_k(x)`, read only at the union of the samples of `f_1..f_k`. That is exact for linear interpolants, because `B_k` is piecewise linear with exactly those breakpoints. So the boundaries have 2 (the floor), 30, 40 and 54 points. Band k is a polygon: `B_k` left to right, then `B_{k-1}` right to left, and the two bands that share a boundary use the very same point array. The dots in `s-boundary-functions.png` are each boundary's own points: the Maps top has 30, the Sports top 40, the Games top 54.

No slivers and no seams are visible. The image looks the same as `s-union-linear.png` (only the y axis title differs: `y` against `y0, y1`). That is expected: with linear interpolation the two methods draw the same function; the boundary method just uses fewer points on the lower boundaries.

**Wall: a ribbon cannot draw a band whose two edges have different x samples.** `ribbon` is `Connect` in edge mode (`ast/marks/chart.ts:1117`): it threads a run of anchors, and each anchor gives both edges of the band at one position along x ("forward along the near edge, a cap across, back along the far edge", `connect.tsx:551`). Band k's bottom has the points of `B_{k-1}` and its top the points of `B_k`, so there is no anchor list that gives both. The band is drawn with `polygon` and a data-bound `points` ring, which works today, draws axes and a legend, and takes the color scale. A polygon has no `curve` option, so this route only gives straight segments.

Emulation: `boundaryBands` 28 lines (uses `linearFn`).

```js
chart(sampled, { w: 480, h: 260 })
  .flow(derive((rows) => boundaryBands(rows).bands)) // { c, ring }
  .mark(polygon({ points: "ring", fill: "c" }))
  // dots on each boundary's own points
  .layer(
    chart(boundaryDots)
      .flow(scatter({ by: "id", x: "x", y: "y" }))
      .mark(circle({ r: 1.6, fill: "black" }))
  );
```

### Curve order: stack then curve, or curve then sum

On `coarse` (three series at 8 x positions), with `Curve.monotone` (d3's `curveMonotoneX`, `src/spline.ts`).

- `s-curve-stack-then-curve.png` (`SCurveStackThenCurve`), **(a), today**: stack the points, then the ribbon curves each boundary on its own.
- `s-curve-curve-then-sum.png` (`SCurveCurveThenSum`), **(b)**: curve each series by itself, read it at 200 x, sum, and draw the sums with straight segments.
- `s-curve-overlay.png` (`SCurveOverlay`): (a)'s boundaries as colored lines, (b)'s as black dashed lines.
- `s-curve-difference.png` (`SCurveDifference`): (a) minus (b) for each band's top boundary.
- `s-curve-thickness.png` (`SCurveThickness`): the Games band's thickness both ways.

They differ. The Maps boundary is the same both ways (the difference line is flat at 0), which also checks that my JS curve (`channelSpline` from `src/spline.ts`) is the one GoFish draws. The Sports top differs by up to 0.25 and the Games top by up to 0.74, about 8 % of the total height. **(a) can give a band negative thickness:** the Games band's top curve falls below its bottom curve near x = 14.6 (thickness -0.12), so the two bands overlap there. In (b) a band's thickness is its own monotone curve, which never leaves the range of its neighboring samples, so it cannot go below 0. (b) is what a sum of functions means. It does not need dense sampling in principle: a sum of piecewise cubics is a piecewise cubic on the union of the knots, so each boundary is exact as cubic segments on the union of its series' knots, as in the linear case.

Emulation: `monotoneAt` 9 lines (wraps `channelSpline`), `curveThenSum` 18 lines, `curveOrderDifference` 17 lines, `curveOrderThickness` 25 lines.

```js
// (a)
chart(coarse, { w: 480, h: 260 })
  .flow(
    derive((rows) => stackRows(rows, {})),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c", curve: Curve.monotone }));

// (b)
chart(coarse, { w: 480, h: 260 })
  .flow(
    derive((rows) => stackRows(curveThenSum(rows), {})),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c", curve: Curve.linear }));

// overlay
chart(coarse, { w: 480, h: 260 })
  .flow(
    derive((rows) => stackRows(rows, {})),
    group({ by: "c" }),
    scatter({ by: "x", x: "x", y: "y1" })
  )
  .mark(line({ stroke: "c", strokeWidth: 1.5, curve: Curve.monotone }))
  .layer(
    chart(stackRows(curveThenSum(coarse), {}))
      .flow(group({ by: "c" }), scatter({ by: "x", x: "x", y: "y1" }))
      .mark(
        line({
          stroke: "black",
          strokeWidth: 1,
          strokeDasharray: "3 2",
          curve: Curve.linear,
        })
      )
  );

// difference and thickness: lines over derived rows
chart(coarse, { w: 480, h: 260 })
  .flow(
    derive((rows) => curveOrderDifference(rows)), // or curveOrderThickness
    group({ by: "c" }),
    scatter({ by: "x", x: "x", y: "y" })
  )
  .mark(line({ stroke: "c", strokeWidth: 1.5, curve: Curve.linear }));
```

## Densities

A Gaussian kernel density per group (Silverman's bandwidth), read at 120 points over the range of all values padded by 2, in `derive` (`densityRows`, 25 lines). The x field is the value v.

| Image                       | Story                 | What                                                                                                                                                                                                                                         |
| --------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d-stacked-density.png`     | `DStackedDensity`     | Each group's density times its share of the rows, stacked from 0. The top boundary is the mixture density of all 130 values.                                                                                                                 |
| `d-conditional-density.png` | `DConditionalDensity` | The same with the expand offset: at each v the bands give P(group given v), as R's `cdplot`. Where all densities are near 0 (the tails) the shares are ratios of tiny numbers, so the edges are pinned by whichever kernel reaches farthest. |
| `d-ridgeline.png`           | `DRidgeline`          | The unweighted densities spread, not stacked: a `spread` by group with `anchor: "baseline"`, each ridge in its own baseline space.                                                                                                           |

```js
// stacked density; conditional density = the same with offset "expand"
chart(samples, { w: 480, h: 260 })
  .flow(
    derive((rows) => stackRows(densityRows(rows), { offset: "zero" })),
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c" }));

// ridgeline
chart(samples, { w: 480, h: 260 })
  .flow(
    derive((rows) => densityRows(rows, { weighted: false })),
    spread({ by: "c", dir: "y", anchor: "baseline", spacing: 70 }),
    scatter({ by: "x", x: "x" })
  )
  .mark(ribbon({ h: "y", fill: "c", opacity: 0.85 }));
```

## Walls and bugs found

1. **Today's stack mis-stacks series that do not share x, with no warning** (`s-naive.png`). The flow `stack` sits inside one x slice and stacks only the rows at that exact x.
2. **A ribbon threads its pieces in data order, not along x** (`s-naive-unsorted.png`): the run is the children in slice-creation order (first appearance of each `by` value), `connect.tsx` around line 551. Unsorted input zigzags.
3. **A ribbon cannot draw a band whose top and bottom edges have different sample sets** (edge mode gives both edges per anchor, `chart.ts:1117`, `connect.tsx:551`). Exact boundary functions need `polygon`, which has no curve.
4. **The default curve on a stacked area can make a band's thickness negative** (`s-curve-thickness.png`). The ribbon's default curve is monotone over a continuous x, and it is applied to each stacked boundary separately, after stacking.
5. **Colors follow row order.** The color scale takes series in order of first appearance, so a `derive` that reorders rows (any stack order) recolors the series. I sort the derived rows by series to keep colors fixed across renders.
6. Cosmetic: a scatter by `yMin`/`yMax` titles the y axis `y0, y1`.
7. Tooling: `capture-one`'s default port 3002 can be held by another session; set `CAPTURE_ONE_PORT`.

## Do boundaries need common sample points?

No. Each boundary `B_k` needs only the breakpoints of the series under it: the union of the samples of `f_1..f_k`. With those it is exact for linear interpolation (and, as cubic segments, for a sum of monotone curves). Lower boundaries then have fewer points (2, 30, 40, 54 here). What prevents slivers is not a common x grid but that the two bands on either side of a boundary draw the same boundary: the same point array, not two separately computed copies. ggplot2's `stat_align` gets the same picture by putting every series on the union grid (54 points everywhere), which is simpler but redundant. Either way, the band is then the region between two boundaries, and its two edges have different sample sets in general, which today's `ribbon` cannot draw.
