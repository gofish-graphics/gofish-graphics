# ribbon

Fills the region between a baseline and a set of data points as a filled band.
Like [`line`](/python/api/marks/line), a ribbon traces a layout produced by
another chart, selected with [`selectAll()`](/python/api/core/chart#cross-chart-references)
— an array of refs whose placed geometry the ribbon reads.

::: gofish example:area-chart hidden
:::

```python
from gofish import layer, chart, spread, blank, selectAll, ribbon

layer([
    chart(lake_totals)
        .flow(spread(by="lake", dir="x", spacing=64))
        .mark(blank(h="count").name("points")),
    chart(selectAll("points")).mark(ribbon(opacity=0.8)),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
ribbon(stroke=None, strokeWidth=None, opacity=None, mixBlendMode=None,
     dir=None, curve=None, by=None, w=None, h=None, emX=None, emY=None) -> Mark
```

## Parameters

| Parameter      | Type                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stroke`       | `str`                                                | Outline color                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `strokeWidth`  | `int`                                                | Outline width in pixels                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `opacity`      | `float`                                              | Opacity, `0`–`1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mixBlendMode` | `str`                                                | CSS blend mode for overlapping areas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `dir`          | `str`                                                | Direction the ribbon fills toward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `curve`        | `str \| dict`                                        | Screen-space path shape; default `"auto"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `by`           | `str \| field(...) \| Callable`                      | Partitions the operand bag (the list of refs) into groups and draws one band per group. Same grammar as any operator's `by` — bare field name, key function, or [`field(...)`](/python/api/operators/spread#field-expression-pipeline) accessor. Resolves against the refs' own datum automatically (no `datum.` prefix), same as `group(by=...)`. Composes with an upstream `group()` as a nested split. When the ribbon is fused into a flow, an explicit `by` overrides the [default grouping](#default-grouping) computed from the flow; omit it and the flow's own groupings decide the split. |
| `w`, `h`       | `int \| float \| str \| FieldAccessor \| datum(...)` | **Ignored by `ribbon` itself.** Blank-fusion anchor keys: read only when `ribbon(...)` is placed directly in `.mark()` position, where they become the invisible anchor tier's `blank(w=..., h=..., emX=..., emY=...)` opts — same channel-value shapes as a leaf mark's "size" channel, including a `field(...)` pipeline like `field("count").sum()`. See [`.layer()`'s blank-fusion section](/python/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart).                                                                                                                         |
| `emX`, `emY`   | `bool`                                               | **Ignored by `ribbon` itself.** Blank-fusion anchor keys — see `w`/`h` above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## The ribbon pattern

Ribbons use the same two-chart recipe as [`line`](/python/api/marks/line#the-line-pattern):
one chart positions named [`blank`](/python/api/marks/blank) marks, a second
`selectAll`s them and draws the `ribbon()`. `selectAll(name)` reads a named layer
from an earlier chart as an array of refs, and `layer([chartA, chartB])` composes
multiple charts into one figure. To re-partition the selection first (e.g. one
ribbon per series), run it through `group(by="datum.field")` — see
[`group`](/python/api/operators/group).

Stack several ribbons in one `layer` — with `opacity` or `mixBlendMode` — for
layered and stacked area charts.

## Default grouping

A ribbon fused into a flow — in `.mark()` position or as `.layer()` sugar over
the previous tier's marks — splits at the flow's own grouping by default: one
tier lays the band's path, and every other grouping in the flow splits it into
separate bands. You don't restate the split with `by` — the flow one line up
already declared it. An explicit `by` still works and overrides the default,
which is useful when you want a different split than the flow implies. This
doesn't apply to a ribbon drawn over an explicit refs bag
(`chart(selectAll(...))`), which is unaffected and keeps needing an explicit
`by` (or an upstream `group()`) to split at all.

## Sugar: `.layer(ribbon(...))`

When the ribbon traces a chart's _own_ marks, skip the two-chart `selectAll`
recipe and chain [`.layer()`](/python/api/core/layer) on the
builder — this is the canonical simple ribbon-chart spelling:

```python
from gofish import chart, spread, stack, field, rect, ribbon

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x", spacing=64),
    stack(by=field("species").sort("count"), dir="y"),
).mark(rect(h="count", fill="species")).layer(
    ribbon(opacity=0.8)
).render(w=400, h=400)
```

No `by` needed: the `stack(by="species")` tier already told the flow how to
group, so the ribbon splits into one band per species by default.

See [`.layer()`](/python/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit
`layer([...])` + `selectAll` form (which is still what you want to trace
_another_ chart's marks).

## Sugar: `.mark(ribbon(...))` (blank-fusion)

When there's no earlier tier at all — just raw data that needs both fresh
anchors and a connector — place `ribbon(...)` directly in `.mark()` position
and skip `.layer()` too:

```python
chart(lake_totals).flow(
    spread(by="lake", dir="x", spacing=64)
).mark(ribbon(h="count", opacity=0.8))

# ...is sugar for the explicit two-tier form:
chart(lake_totals).flow(
    spread(by="lake", dir="x", spacing=64)
).mark(blank(h="count")).layer(ribbon(opacity=0.8))
```

A grouped flow fuses the same way, with no `by` needed:

```python
chart(seafood, axes=True).flow(
    spread(by="lake", dir="x", spacing=64, alignment="middle"),
    stack(by="species", dir="y"),
).mark(ribbon(h="count", fill="species", opacity=0.8))
```

`fill` here is a shared field name, homogeneous within each species group
(the default split, above) — it resolves through the color scale per group,
the same as it would if `fill` were declared on an explicit anchor `blank()`.

See [`.layer()`'s blank-fusion section](/python/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart)
for the full desugaring rule (the `w`/`h`/`emX`/`emY` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`emX`/`emY` anchor channels are only meaningful when `ribbon` gets
to synthesize its own anchors this way; passing them to a `ribbon` that
instead connects already-drawn marks (an empty-scope `chart()` tier inside
`.layer()`, or `chart(selectAll(...))`/`chart(ref(...))`) is an error, since
there's nothing left for them to anchor.

## Examples

```python
# Semi-transparent ribbon
chart(selectAll("points")).mark(ribbon(opacity=0.8))
```
