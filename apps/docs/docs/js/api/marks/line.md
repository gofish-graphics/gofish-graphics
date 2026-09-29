---
order: 40
---

# line

Connects data points center-to-center with a line. Takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

::: gofish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.layer([
  gf
    .chart(locations)
    .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
    .mark(gf.blank().name("points")),
  gf
    .chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "steelblue", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
line({ stroke?, strokeWidth = 1, strokeDasharray?, opacity?, curve = "auto", along?, from?, to?, w?, h?, emX?, emY? })
```

## Parameters

::: gofish-ref line
:::

When `curve` is omitted (`"auto"`), `line` inspects the connected points. If they
share a continuous connection axis, it smooths them with `"monotone"`.
Otherwise it draws a straight polyline.

## Curves through data

Five curve names read a run of values over the field that orders it, such as
the years of a line chart. From the least to the most smooth, they are `step`,
`linear`, `monotone`, `smooth` and `smoother`. The same names work in
[`time.transition()`](/js/animation), `animation.tween()` and
[`interpolate()`](/js/animation#interpolate-rows-options), so a moving mark and a line
through the same points can follow the same curve.

A few terms help compare them. A curve is **C0** when it has no breaks, **C1**
when its direction also never changes suddenly (it has no corners), and **C2**
when its curvature never changes suddenly either. A curve **overshoots** when,
between two neighboring points, it goes above the higher one or below the
lower one. A curve is **local** when changing one value changes the curve only
near that point.

| Name       | What you see                                                                        | Algorithm                                                                           | Continuity     | Local | Never overshoots |
| ---------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------- | ----- | ---------------- |
| `step`     | Each value holds until the next point, and then jumps.                              | step-after, like d3's `curveStepAfter`                                              | not continuous | yes   | yes              |
| `linear`   | Straight segments from point to point.                                              | straight lines                                                                      | C0             | yes   | yes              |
| `monotone` | A smooth curve that turns exactly on the points.                                    | Steffen (1990), the same curve as d3's `curveMonotoneX`                             | C1             | yes   | yes              |
| `smooth`   | Rounder peaks that can pass a little beyond their points. Long flat runs stay flat. | modified Akima, also called makima (Moler 2019), as in MATLAB and SciPy             | C1             | yes   | no               |
| `smoother` | The smoothest curve, with no sudden change in curvature. It can dip next to a jump. | Yuksel (2020), "A Class of C2 Interpolating Curves", applied to one value at a time | C2             | yes   | no               |

`step` holds every value that depends on the field that orders the line until
the next point's value of that field, and then jumps. It never holds the field
itself. On a line chart over years, the year is the x axis, so the line moves
along x while y holds, and the jump is a vertical riser: the staircase of d3's
`curveStepAfter` and Vega-Lite's `interpolate: "step-after"`. On a connected
scatterplot over years, x and y both depend on the year, so both hold, and
the jump is a straight line from one point to the next. It looks like
`linear`, but all of the time is spent at the points, so a line drawn in over
time jumps from one point to the next at the moment the next year arrives.
This differs on purpose from d3's step curves, which always draw a
horizontal step and then a vertical one on the screen, whatever the axes
mean.

`"monotone"` is **piecewise** monotone. Between two neighboring points, each
coordinate only rises or only falls, so the curve never goes past either point.
It does not make the whole line monotone. The line still turns where the data
turns, and the peak sits exactly on the data point. For a path in x and y, such
as a connected scatterplot, this holds for x and y separately, over the field
that orders the line. It is the same curve as d3's `curveMonotoneX` and
Vega-Lite's `interpolate: "monotone"`.

`"smooth"` lets a peak round off a little past its point. A run of three or
more equal values stays exactly flat. A single flat step between a rise and a
fall, such as two equal peak values, can bow a little.

`"smoother"` has no sudden change in curvature anywhere, so it looks the most
even. Next to a sudden jump in the data it can dip a little past the points on
either side. It is not a cubic curve, so GoFish draws each stretch between two
points with 12 short cubic pieces. At usual chart sizes the drawn line is
within a few thousandths of a pixel of the exact curve.

A line drawn with one of these curves takes the knots of its curve from the
data when the data has a value that orders the line. (The knots are the
positions along the curve where it passes through each point.) `line` uses the
first of these that it finds:

- The values of the field the line runs along, when they are numbers that only
  go up or only go down along the line. This is the field `along` names, or the
  field of the tier the line was inferred to run along, e.g., the years of a
  connected scatterplot. A line through the keyframes of a
  [`time.sequence`](/js/animation) uses the keyframes' time values.
- The points' positions on the connection axis, when that axis is continuous
  and the points are in order along it, e.g., a line chart over x.
- The distances between the points on the screen, when neither of the above
  applies. These are centripetal knots. Two points at the same spot, up to
  rounding, are one point: the curve drops the repeat, as d3 does.

Because the knots come from the data, a line and a
[`time.transition()`](/js/animation) through the same points follow the same
curve when they use the same curve name.

`"catmullRom"` draws a centripetal Catmull-Rom spline through the points on the
screen, as d3's `curveCatmullRom` does. Its knots are always the distances
between the points on the screen, whatever field orders the line. It can
overshoot between two points. It is not used when values are read over time: a
`time.transition()` along the same points follows one of the curves above, so
its moving mark can sit slightly off a Catmull-Rom line.

`curve` accepts the strings `"linear"`, `"bezier"`, `"step"`, `"monotone"`,
`"smooth"`, `"smoother"` or `"catmullRom"`, or a `CurveSpec` factory:
`bezier()`, `orthogonal({ bend? })`, `arc({ direction: "up" | "down" })`, or
`perfectArrows({ bow })`. `"linear"` has no factory, because
[`linear()`](/js/api/coords/linear) is the coordinate transform. The `orthogonal`
elbow bends at the midpoint of the connector's `dir` axis; pass
`orthogonal({ bend: "auto" })` to infer the bend axis from the endpoint geometry
instead (for layouts with no single growth axis).

## Two forms

- **Bag form** — `line()` over a `GoFishRef[]` (e.g. [`selectAll()`](/js/api/selection/ref)):
  one polyline through all the refs (the example above).
- **Pairwise form** — `line({ from, to })` over rows whose `from`/`to` columns
  hold refs: one segment per row. Use after [`resolve`](/js/api/operators/resolve)
  has turned an edge table's endpoint ids into node refs — this is how node-link
  edges are drawn. See [`.layer()`](/js/api/core/layer) for the full recipe.

## Default grouping

A line fused into a flow — in `.mark()` position or as `.layer()` sugar over
the previous tier's marks — splits at the flow's own grouping by default: one
tier lays the line's path, and every other grouping in the flow splits it into
separate lines. You don't restate the split — the flow one line up already
declared it, and `line` has no option that spells the split directly.

When you need a _different_ path tier than the one inference would pick, name
it with `along`: `along: "year"` finds the flow tier whose `by` is `"year"`,
makes it the path, and splits by every other grouping tier instead. Naming a
field no tier groups by is an error. This doesn't apply to a line drawn over
an explicit refs bag (`chart(selectAll(...))`) or the pairwise `{ from, to }`
form — `along` is only meaningful when the line fuses into a chart's own
flow, and throws if used on either of those. A refs bag spells its split
structurally instead, with an upstream `flow(group({ by: "species" }))`.

A slope chart is a good example of why the default matters: ten barley
varieties across six field sites, one short line per site-variety pair from
1931 to 1932, with no line crossing a site boundary.

```ts
chart(barley, { axes: true })
  .flow(
    spread({ by: "site", dir: "x", spacing: 110 }),
    spread({ by: "year", dir: "x", spacing: 36 }),
    scatter({ by: "variety", y: "yield" })
  )
  .mark(line({ stroke: "variety", strokeWidth: 2 }));
```

No option at all: the innermost tier that lays out the travel axis (the
`year` spread) becomes the path, and every other grouping — `site` and
`variety` — splits, giving one line per site-variety pair. Writing the same
split by hand would take a composite key over both fields; naming it
explicitly would be `line({ along: "year", stroke: "variety", strokeWidth: 2
})`, which picks the same path tier the default already infers.

## Sugar: `.layer(line(...))`

When the line connects a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.layer()`](/js/api/core/layer) on the builder with a bare
`line(...)`:

```ts
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
  .layer(line({ stroke: "black", strokeWidth: 2 }));
```

See [`.layer()`](/js/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit `layer([...])`

- `selectAll` form below (which is still what you want to connect _another_
  chart's marks).

## Sugar: `.mark(line(...))` (blank-fusion)

When there's no earlier tier at all — just raw data that needs both fresh
anchors and a connector — place `line(...)` directly in `.mark()` position and
skip `.layer()` too:

```ts
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }));

// ...is sugar for the explicit two-tier form:
chart(data)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(blank())
  .layer(line({ stroke: "steelblue", strokeWidth: 2 }));
```

See [`.layer()`'s blank-fusion section](/js/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart)
for the full desugaring rule (the `{w, h, emX, emY}` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`emX`/`emY` anchor channels are only meaningful when `line` gets to
synthesize its own anchors this way; passing them to a `line` that instead
connects already-drawn marks (an empty-scope `chart()` tier inside `.layer()`,
or `chart(selectAll(...))`/`chart(ref(...))`) is an error, since there's
nothing left for them to anchor.

## Example

```ts
// First chart: bar chart with named layer
chart(data)
  .flow(spread({ by: "x", dir: "x" }))
  .mark(rect({ h: "y" }).name("bars"))
  .render(container, { w: 500, h: 300 });

// Second chart: line over the same bars
chart(selectAll("bars"))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
  .render(container, { w: 500, h: 300 });
```
