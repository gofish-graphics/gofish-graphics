# line

Connects data points with a line. A line draws **through** a set of points, so
it is most often paired with [`selectAll()`](/python/api/core/chart#cross-chart-references)
to trace a layout produced by another chart. `selectAll` hands `line` an array
of refs, and the line reads placed geometry off them.

::: gofish example:line-chart hidden
:::

```python
from gofish import layer, chart, scatter, blank, selectAll, line

layer([
    chart(catch_locations)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points")),
    chart(selectAll("points")).mark(line()),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
line(stroke=None, strokeWidth=None, strokeDasharray=None, opacity=None, curve=None, along=None, w=None, h=None, emX=None, emY=None) -> Mark
```

## Parameters

| Parameter         | Type                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stroke`          | `str`                                                | Line color                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `strokeWidth`     | `int`                                                | Line width in pixels                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `strokeDasharray` | `str`                                                | Raw SVG `stroke-dasharray` (e.g. `"12"`) for a dashed line                                                                                                                                                                                                                                                                                                                                                                                                              |
| `opacity`         | `float`                                              | Opacity, `0`–`1`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `curve`           | `str \| dict`                                        | Path shape; default `"auto"`, which auto-smooths continuous line charts                                                                                                                                                                                                                                                                                                                                                                                                 |
| `along`           | `str`                                                | Names a flow tier by its `by` field (see [Default grouping](#default-grouping)): that tier becomes the line's path, and every other grouping tier splits into separate lines. Usually omitted — the path tier is inferred from the flow shape. Naming a field that matches no tier, or using `along` on a line that doesn't fuse into a chart's own flow (a refs bag, or the pairwise `from`/`to` form), throws.                                                        |
| `w`, `h`          | `int \| float \| str \| FieldAccessor \| datum(...)` | **Ignored by `line` itself.** Blank-fusion anchor keys: read only when `line(...)` is placed directly in `.mark()` position, where they become the invisible anchor tier's `blank(w=..., h=..., emX=..., emY=...)` opts — same channel-value shapes as a leaf mark's "size" channel, including a `field(...)` pipeline like `field("count").sum()`. See [`.layer()`'s blank-fusion section](/python/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart). |
| `emX`, `emY`      | `bool`                                               | **Ignored by `line` itself.** Blank-fusion anchor keys — see `w`/`h` above.                                                                                                                                                                                                                                                                                                                                                                                             |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## The line pattern

A line needs points to connect. The idiomatic recipe:

1. One chart positions invisible [`blank`](/python/api/marks/blank) marks and
   names the layer with `.name("points")`.
2. A second chart selects that layer — `chart(selectAll("points"))` — and draws
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
an explicit refs bag (`chart(selectAll(...))`) or the pairwise `from`/`to`
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
).mark(line(stroke="variety", strokeWidth=2))
```

No option at all: the innermost tier that lays out the travel axis (the
`year` spread) becomes the path, and every other grouping — `site` and
`variety` — splits, giving one line per site-variety pair. Writing the same
split by hand would take a composite key over both fields; naming it
explicitly would be `line(along="year", stroke="variety", strokeWidth=2)`,
which picks the same path tier the default already infers.

## Sugar: `.layer(line(...))`

When the line connects a chart's _own_ marks, skip the two-chart `selectAll`
recipe and chain [`.layer()`](/python/api/core/layer) on the builder with a
bare `line(...)`:

```python
from gofish import chart, scatter, circle, line

chart(driving_shifts, axes=True).flow(
    scatter(by="year", x="miles", y="gas")
).mark(circle(r=4, fill="white", stroke="black", strokeWidth=2)).layer(
    line(stroke="black", strokeWidth=2)
).render(w=500, h=300)
```

See [`.layer()`](/python/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit
`layer([...])` + `selectAll` form (which is still what you want to connect
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
for the full desugaring rule (the `w`/`h`/`emX`/`emY` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`emX`/`emY` anchor channels are only meaningful when `line` gets to
synthesize its own anchors this way; passing them to a `line` that instead
connects already-drawn marks (an empty-scope `chart()` tier inside `.layer()`,
or `chart(selectAll(...))`/`chart(ref(...))`) is an error, since there's
nothing left for them to anchor.

## Examples

```python
# Styled line
chart(selectAll("points")).mark(line(stroke="black", strokeWidth=2))
```
