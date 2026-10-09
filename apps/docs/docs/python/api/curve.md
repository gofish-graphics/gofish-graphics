---
title: Curve
---

# Curve

The `Curve` family holds the ways a path can run through its points. A curve is
the value of the `curve` option of [`line`](/python/api/marks/line) and
[`ribbon`](/python/api/marks/ribbon).

```python
from gofish import chart, circle, line, scatter, Curve

(
    chart(driving_shifts, axes=True)
    .flow(scatter(by="year", x="miles", y="gas"))
    .mark(circle(r=2.5, fill="white", stroke="black", stroke_width=1))
    .layer(line(along="year", curve=Curve.monotone()))
    .render(w=400, h=300)
)
```

## Signature

```python
Curve.linear()
Curve.step()
Curve.monotone()
Curve.smooth()
Curve.catmull_rom()
Curve.bezier()
Curve.orthogonal(bend=None)
Curve.arc(direction=None)
Curve.perfect_arrows(bow=None, stretch=None, stretch_min=None, stretch_max=None,
                     pad_start=None, pad_end=None, flip=None, straights=None)
```

Every member is a function call, including the ones that take no options. Each
returns a plain dict, `{"kind": ..., **params}`, with snake_case param keys,
for example `{"kind": "perfectArrows", "pad_end": 4}`. The `curve` option
renames the keys, so the chart carries the same value the JavaScript `Curve`
family makes, `{"kind": "perfectArrows", "padEnd": 4}`.

The family is also a module of its own:

```python
from gofish import Curve
from gofish.curve import monotone  # the same function as Curve.monotone
```

## Members

| Member                   | What it draws                                                           |
| ------------------------ | ----------------------------------------------------------------------- |
| `Curve.step()`           | Each value holds until the next point, and then jumps.                  |
| `Curve.linear()`         | Straight segments from point to point.                                  |
| `Curve.monotone()`       | A smooth curve that turns exactly on the points.                        |
| `Curve.smooth()`         | Rounder peaks that can pass a little beyond their points.               |
| `Curve.catmull_rom()`    | A centripetal Catmull-Rom spline through the points on the screen.      |
| `Curve.bezier()`         | A cubic bezier between each pair of points (d3's `linkVertical`).       |
| `Curve.orthogonal()`     | A right-angle elbow that bends at the midpoint of the connector's axis. |
| `Curve.arc()`            | A half circle through both points.                                      |
| `Curve.perfect_arrows()` | The arc between two boxes that the perfect-arrows library draws.        |

When a `line` or `ribbon` has no `curve`, it looks at the connected points. If
they share a continuous connection axis, it uses `Curve.monotone()`. Otherwise a
`line` uses `Curve.linear()` and a `ribbon` uses `Curve.bezier()`.

## Curves through data

Four curves read a run of values over the field that orders it, such as the
years of a line chart. From the least to the most smooth, they are
`Curve.step()`, `Curve.linear()`, `Curve.monotone()` and `Curve.smooth()`.

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

`Curve.monotone()` is **piecewise** monotone. Between two neighboring points,
each coordinate only rises or only falls, so the curve never goes past either
point. It does not make the whole line monotone. The line still turns where the
data turns, and the peak sits exactly on the data point.

`Curve.smooth()` lets a peak round off a little past its point. A run of three
or more equal values stays exactly flat, while a single flat step between a
rise and a fall can bow a little.

`Curve.step()` holds every value that depends on the field that orders the line
until the next point's value of that field, and then jumps. It never holds the
field itself. On a line chart over years, the year is the x axis, so the line
moves along x while y holds, and the jump is a vertical riser: the staircase of
d3's `curveStepAfter` and Vega-Lite's `interpolate: "step-after"`. On a
connected scatterplot over years, x and y both depend on the year, so both
hold, and the jump is a straight line from one point to the next, so it looks
like `Curve.linear()`. This differs on purpose from d3's step curves, which
always draw a horizontal step and then a vertical one on the screen, whatever
the axes mean.

See the [JavaScript `Curve` page](/js/api/curve#curves-through-data) for how a
line picks the knots of its curve.

## Curves on the screen

`Curve.catmull_rom()` draws a centripetal Catmull-Rom spline through the points
on the screen. It can overshoot between two points.

`Curve.bezier()`, `Curve.orthogonal()`, `Curve.arc()` and
`Curve.perfect_arrows()` route each pair of neighboring points on their own. The
`Curve.orthogonal()` elbow bends at the midpoint of the connector's `dir` axis;
`Curve.orthogonal(bend="auto")` infers the bend axis from the endpoint geometry
instead. `Curve.arc()` bulges up by default; `direction="down"` flips it.
