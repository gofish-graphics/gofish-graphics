---
order: 40
---

# line

Connects data points with a line. A line draws **through** a set of points, so
it is most often paired with [`select_all()`](/python/api/core/chart#cross-chart-references)
to trace a layout produced by another chart. `select_all` hands `line` an array
of refs, and the line reads placed geometry off them.

::: gofish example:line-chart hidden
:::

```python
from gofish import layer, chart, scatter, blank, select_all, line

layer([
    chart(catch_locations)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points")),
    chart(select_all("points")).mark(line()),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
line(stroke=None, stroke_width=None, stroke_dasharray=None, opacity=None, curve=None, along=None, w=None, h=None, em_x=None, em_y=None) -> Mark
```

## Parameters

::: gofish-ref line
:::

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Curves through data

Four curve names draw a line through a run of values, read over the field that
orders it, such as the years of a line chart. From the least to the most
smooth, they are `"step"`, `"linear"`, `"monotone"` and `"smooth"`. When
`curve` is left out, a line over a continuous axis uses `"monotone"`.

A few terms help compare them. A curve is **C0** when it has no breaks, and
**C1** when its direction also never changes suddenly (it has no corners). A
curve **overshoots** when,
between two neighboring points, it goes above the higher one or below the
lower one. A curve is **local** when changing one value changes the curve only
near that point.

| Name       | What you see                                                                        | Algorithm                                                               | Continuity     | Local | Never overshoots |
| ---------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ----- | ---------------- |
| `step`     | Each value holds until the next point, and then jumps.                              | step-after, like d3's `curveStepAfter`                                  | not continuous | yes   | yes              |
| `linear`   | Straight segments from point to point.                                              | straight lines                                                          | C0             | yes   | yes              |
| `monotone` | A smooth curve that turns exactly on the points.                                    | Steffen (1990), the same curve as d3's `curveMonotoneX`                 | C1             | yes   | yes              |
| `smooth`   | Rounder peaks that can pass a little beyond their points. Long flat runs stay flat. | modified Akima, also called makima (Moler 2019), as in MATLAB and SciPy | C1             | yes   | no               |

`"monotone"` is **piecewise** monotone. Between two neighboring points, each
coordinate only rises or only falls, so the curve never goes past either point.
It does not make the whole line monotone. The line still turns where the data
turns, and the peak sits exactly on the data point.

`"smooth"` lets a peak round off a little past its point. A run of three or
more equal values stays exactly flat, while a single flat step between a rise
and a fall can bow a little.

`step` holds every value that depends on the field that orders the line until
the next point's value of that field, and then jumps. It never holds the field
itself. On a line chart over years, the year is the x axis, so the line moves
along x while y holds, and the jump is a vertical riser: the staircase of d3's
`curveStepAfter` and Vega-Lite's `interpolate: "step-after"`. On a connected
scatterplot over years, x and y both depend on the year, so both hold, and
the jump is a straight line from one point to the next, so it looks like
`linear`. This differs on purpose from d3's step curves, which always draw a
horizontal step and then a vertical one on the screen, whatever the axes
mean.

See the [JavaScript `line` page](/js/api/marks/line#curves-through-data) for
how a line picks the knots of its curve.

## The line pattern

A line needs points to connect. The idiomatic recipe:

1. One chart positions invisible [`blank`](/python/api/marks/blank) marks and
   names the layer with `.name("points")`.
2. A second chart selects that layer — `chart(select_all("points"))` — and draws
   a `line()` through it.
3. `layer([...])` composes the two.

This separation lets the same positioned points back both a line and, say,
circles drawn on top.

## Default grouping

A line fused into a flow — in `.mark()` position or as `.layer()` sugar over
the previous tier's marks — splits at the flow's own grouping by default: one
tier lays the line's path, and every other grouping in the flow splits it into
separate lines. You don't restate the split — the flow one line up already
declared it, and `line` has no option that spells the split directly.

When you need a _different_ path tier than the one inference would pick, name
it with `along`: `along="year"` finds the flow tier whose `by` is `"year"`,
makes it the path, and splits by every other grouping tier instead. Naming a
field no tier groups by is an error. This doesn't apply to a line drawn over
an explicit refs bag (`chart(select_all(...))`) or the pairwise `from`/`to`
form — `along` is only meaningful when the line fuses into a chart's own
flow, and throws if used on either of those. A refs bag spells its split
structurally instead, with an upstream `flow(group(by="species"))`.

A slope chart is a good example of why the default matters: ten barley
varieties across six field sites, one short line per site-variety pair from
1931 to 1932, with no line crossing a site boundary.

```python
from gofish import chart, spread, scatter, line

chart(barley, axes=True).flow(
    spread(by="site", dir="x", spacing=110),
    spread(by="year", dir="x", spacing=36),
    scatter(by="variety", y="yield"),
).mark(line(stroke="variety", stroke_width=2))
```

No option at all: the innermost tier that lays out the travel axis (the
`year` spread) becomes the path, and every other grouping — `site` and
`variety` — splits, giving one line per site-variety pair. Writing the same
split by hand would take a composite key over both fields; naming it
explicitly would be `line(along="year", stroke="variety", stroke_width=2)`,
which picks the same path tier the default already infers.

## Sugar: `.layer(line(...))`

When the line connects a chart's _own_ marks, skip the two-chart `select_all`
recipe and chain [`.layer()`](/python/api/core/layer) on the builder with a
bare `line(...)`:

```python
from gofish import chart, scatter, circle, line

chart(driving_shifts, axes=True).flow(
    scatter(by="year", x="miles", y="gas")
).mark(circle(r=4, fill="white", stroke="black", stroke_width=2)).layer(
    line(stroke="black", stroke_width=2)
).render(w=500, h=300)
```

See [`.layer()`](/python/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit
`layer([...])` + `select_all` form (which is still what you want to connect
_another_ chart's marks).

## Sugar: `.mark(line(...))` (blank-fusion)

When there's no earlier tier at all — just raw data that needs both fresh
anchors and a connector — place `line(...)` directly in `.mark()` position and
skip `.layer()` too:

```python
chart(catch_locations).flow(
    scatter(by="lake", x="x", y="y")
).mark(line())

# ...is sugar for the explicit two-tier form:
chart(catch_locations).flow(
    scatter(by="lake", x="x", y="y")
).mark(blank()).layer(line())
```

See [`.layer()`'s blank-fusion section](/python/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart)
for the full desugaring rule (the `w`/`h`/`em_x`/`em_y` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`em_x`/`em_y` anchor channels are only meaningful when `line` gets to
synthesize its own anchors this way; passing them to a `line` that instead
connects already-drawn marks (an empty-scope `chart()` tier inside `.layer()`,
or `chart(select_all(...))`/`chart(ref(...))`) is an error, since there's
nothing left for them to anchor.

## Examples

```python
# Styled line
chart(select_all("points")).mark(line(stroke="black", stroke_width=2))
```
