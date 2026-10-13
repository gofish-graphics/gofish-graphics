---
title: Curve
---

# Curve

The `Curve` family holds the ways a path can run through its points. A curve is
the value of the `curve` option of [`line`](/js/api/marks/line) and
[`ribbon`](/js/api/marks/ribbon), of [`time.transition()`](/js/animation) and
`Animation.tween()`, and of the `method` option of
[`interpolate()`](/js/animation#interpolate-rows-options).

::: gofish

```js
gf.chart(drivingShifts, { axes: true })
  .flow(gf.scatter({ by: "year", x: "miles", y: "gas" }))
  .mark(gf.circle({ r: 2.5, fill: "white", stroke: "black", strokeWidth: 1 }))
  .layer(gf.line({ along: "year", curve: gf.Curve.monotone() }))
  .render(root, { w: 400, h: 300 });
```

:::

## Signature

```ts
Curve.linear();
Curve.step();
Curve.monotone();
Curve.smooth();
Curve.catmullRom();
Curve.bezier();
Curve.orthogonal({ bend?: "auto" });
Curve.arc({ direction?: "up" | "down" });
Curve.perfectArrows({ bow?, stretch?, stretchMin?, stretchMax?, padStart?, padEnd?, flip?, straights? });
```

Every member is a function call, including the ones that take no options. Each
returns a plain object, `{ kind, ...params }`, of type `Curve.Curve`, for
example `{ kind: "arc", direction: "down" }`. The same object is the curve's
wire form.

The family is also a module of its own:

```ts
import { Curve } from "gofish-graphics";
import { monotone } from "gofish-graphics/curve"; // the same function as Curve.monotone
```

## Members

| Member                  | What it draws                                                           | Read over time |
| ----------------------- | ----------------------------------------------------------------------- | -------------- |
| `Curve.step()`          | Each value holds until the next point, and then jumps.                  | yes            |
| `Curve.linear()`        | Straight segments from point to point.                                  | yes            |
| `Curve.monotone()`      | A smooth curve that turns exactly on the points.                        | yes            |
| `Curve.smooth()`        | Rounder peaks that can pass a little beyond their points.               | yes            |
| `Curve.catmullRom()`    | A centripetal Catmull-Rom spline through the points on the screen.      | no             |
| `Curve.bezier()`        | A cubic bezier between each pair of points (d3's `linkVertical`).       | no             |
| `Curve.orthogonal()`    | A right-angle elbow that bends at the midpoint of the connector's axis. | no             |
| `Curve.arc()`           | A half circle through both points.                                      | no             |
| `Curve.perfectArrows()` | The arc between two boxes that the perfect-arrows library draws.        | no             |

A curve that is read over time can also move a mark: `time.transition()`,
`Animation.tween()` and `interpolate()` take only those four.

When a `line` or `ribbon` has no `curve`, it looks at the connected points. If
they share a continuous connection axis, it uses `Curve.monotone()`. Otherwise a
`line` uses `Curve.linear()` and a `ribbon` uses `Curve.bezier()`.
`time.transition()`, `Animation.tween()` and `interpolate()` default to
`Curve.monotone()`.

## Curves through data

Four curves read a run of values over the field that orders it, such as the
years of a line chart. From the least to the most smooth, they are
`Curve.step()`, `Curve.linear()`, `Curve.monotone()` and `Curve.smooth()`.
Because they read the same run the same way, a moving mark and a line through
the same points can follow the same curve.

A few terms help compare them. A curve is **C0** when it has no breaks, and
**C1** when its direction also never changes suddenly (it has no corners). A
curve **overshoots** when,
between two neighboring points, it goes above the higher one or below the
lower one. A curve is **local** when changing one value changes the curve only
near that point.

| Curve              | Algorithm                                                               | Continuity     | Local | Never overshoots |
| ------------------ | ----------------------------------------------------------------------- | -------------- | ----- | ---------------- |
| `Curve.step()`     | step-after, like d3's `curveStepAfter`                                  | not continuous | yes   | yes              |
| `Curve.linear()`   | straight lines                                                          | C0             | yes   | yes              |
| `Curve.monotone()` | Steffen (1990), the same curve as d3's `curveMonotoneX`                 | C1             | yes   | yes              |
| `Curve.smooth()`   | modified Akima, also called makima (Moler 2019), as in MATLAB and SciPy | C1             | yes   | no               |

`Curve.step()` holds every value that depends on the field that orders the line
until the next point's value of that field, and then jumps. It never holds the
field itself. On a line chart over years, the year is the x axis, so the line
moves along x while y holds, and the jump is a vertical riser: the staircase of
d3's `curveStepAfter` and Vega-Lite's `interpolate: "step-after"`. On a
connected scatterplot over years, x and y both depend on the year, so both
hold, and the jump is a straight line from one point to the next. It looks like
`Curve.linear()`, but all of the time is spent at the points, so a line drawn in
over time jumps from one point to the next at the moment the next year arrives.
This differs on purpose from d3's step curves, which always draw a horizontal
step and then a vertical one on the screen, whatever the axes mean. On a
`ribbon`, it steps both edges, as Vega-Lite's stepped area does.

`Curve.monotone()` is **piecewise** monotone. Between two neighboring points,
each coordinate only rises or only falls, so the curve never goes past either
point. It does not make the whole line monotone. The line still turns where the
data turns, and the peak sits exactly on the data point. For a path in x and y,
such as a connected scatterplot, this holds for x and y separately, over the
field that orders the line. It is the same curve as d3's `curveMonotoneX` and
Vega-Lite's `interpolate: "monotone"`.

`Curve.smooth()` lets a peak round off a little past its point. A run of three
or more equal values stays exactly flat. A single flat step between a rise and
a fall, such as two equal peak values, can bow a little.

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

A `ribbon` picks its knots the same way, and both edges of the band use the
same knots. Because the knots come from the data, a line and a
[`time.transition()`](/js/animation) through the same points follow the same
curve when they use the same curve.

## Curves on the screen

`Curve.catmullRom()` draws a centripetal Catmull-Rom spline through the points
on the screen, as d3's `curveCatmullRom` does. Its knots are always the
distances between the points on the screen, whatever field orders the line. It
can overshoot between two points. It is not read over time: a
`time.transition()` along the same points follows one of the curves above, so
its moving mark can sit slightly off a Catmull-Rom line.

`Curve.bezier()`, `Curve.orthogonal()`, `Curve.arc()` and
`Curve.perfectArrows()` route each pair of neighboring points on their own. The
`Curve.orthogonal()` elbow bends at the midpoint of the connector's `dir` axis;
`Curve.orthogonal({ bend: "auto" })` infers the bend axis from the endpoint
geometry instead, for layouts with no single growth axis. `Curve.arc()` bulges
up by default; `{ direction: "down" }` flips it. A line threaded through the
keyframes of a `time.sequence` cannot use `Curve.orthogonal()`, `Curve.arc()` or
`Curve.perfectArrows()`.
