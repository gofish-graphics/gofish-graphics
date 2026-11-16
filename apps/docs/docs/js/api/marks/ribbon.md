---
order: 50
---

# ribbon

Fills a band. It has two forms. The shape form, `ribbon({ x, h })`, draws one band per group from its rows: an area chart. The connector form fills a band between marks another flow placed (edge to edge): sankey ribbons and bands between bars. It takes the array of refs returned by [`selectAll()`](/js/api/selection/ref).

::: gofish

```js
const lakeTotals = Object.entries(_.groupBy(seafood, "lake")).map(
  ([lake, items]) => ({
    lake,
    count: items.reduce((sum, item) => sum + item.count, 0),
  })
);

gf.layer([
  gf
    .chart(lakeTotals)
    .flow(gf.spread({ by: "lake", dir: "x", spacing: 64 }))
    .mark(gf.blank({ h: "count" }).name("points")),
  gf.chart(gf.selectAll("points")).mark(gf.ribbon({ opacity: 0.6 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
// Shape form
ribbon({ x, h, fill?, stroke?, strokeWidth = 0, opacity?, blendMode = "normal", curve? })
ribbon({ y, w, fill?, stroke?, strokeWidth = 0, opacity?, blendMode = "normal", curve? })

// Connector form
ribbon({ stroke?, strokeWidth = 0, opacity?, blendMode = "normal", dir = "x", curve?, along?, from?, to?, w?, h?, emX?, emY? })
```

## Parameters

::: gofish-ref ribbon
:::

## Shape form

Given `x`, the ribbon draws one band per group, from 0 to `h` at each row's
`x`. Given `y`, it draws from 0 to `w` at each row's `y`. The rows are sorted
by `x` (or `y`), which must be a numeric or time column. Two rows of one
group at the same `x` are an error: split them with
[`group`](/js/api/operators/group) first. `h` may be negative, and the band
then goes below the baseline. The curve defaults to `Curve.monotone()` and
takes `Curve.linear()`, `Curve.step()`, `Curve.monotone()` or
`Curve.smooth()`.

```ts
chart(unemployment, { schema: { date: Unit.time() } })
  .flow(group({ by: "series" }))
  .mark(ribbon({ x: "date", h: "count", fill: "series", opacity: 0.5 }));
```

A [`stack`](/js/api/operators/stack#stacked-areas) of shape-form ribbons is a
stacked area. Each band keeps its thickness at every `x`, and sits on the
bands before it. Outside its own rows a band has thickness 0.

```ts
chart(unemployment, { schema: { date: Unit.time() } })
  .flow(stack({ by: "series", dir: "y" }))
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));
```

## Function channels

`x` and `h` (or `y` and `w`) may hold a function value, made with
[`fun`](/js/api/core/fun), in place of a column. The ribbon then has one
parameter `t`, and reads every function channel at the same `t`. Its edges
are the functions themselves, not curves through rows.

- `x` holds `f.support()`, which is `t` itself over the domain of `f`.
- Every function channel has the same domain, or it is an error that names
  both.
- `h` may be a number instead, a constant over `t`. A column beside a
  function is an error, since rows are not read at `t`.
- `curve` is an error, since a function runs as it is.

```ts
const bump = fun((t) => 1 + Math.exp(-((t - 4) ** 2)), { domain: [0, 10] });
const wave = fun((t) => 1 + 0.6 * Math.sin(t), { domain: [0, 10] });

stack({ dir: "y" }, [
  ribbon({ x: bump.support(), h: bump }),
  ribbon({ x: wave.support(), h: wave }),
]);
```

A stack of such ribbons keeps each band's thickness at every `t`, and takes
a [`Baseline`](/js/api/baseline) like any stacked area. It draws under a
coordinate transform too.

## Connector form

`curve` takes a member of the [`Curve`](/js/api/curve) family:
`Curve.linear()`, `Curve.bezier()`, `Curve.step()`, `Curve.monotone()`,
`Curve.smooth()` or `Curve.catmullRom()`. When `curve` is omitted, `ribbon`
inspects the connection axis: over a homogeneous **continuous** axis (a stacked
area / streamgraph sampling a continuous variable) it smooths the band edges
with `Curve.monotone()` — matching its [`line`](/js/api/marks/line) sibling —
and otherwise draws a **bezier** band, `Curve.bezier()` (the band equivalent of
a straight line: the honest connector between discrete regions, as in a sankey
or a categorical ribbon).

A ribbon drawn with `Curve.monotone()` or `Curve.smooth()` takes the knots of
its curve the same way a [`line`](/js/api/marks/line) does, and both edges of
the band use the same knots. `Curve.step()` steps both edges, as Vega-Lite's
stepped area does. The [`Curve`](/js/api/curve#curves-through-data) page
compares the curves.

Like [`line`](/js/api/marks/line), `ribbon` has a **bag form** (over a `GoFishRef[]`,
shown below) and a **pairwise form** `ribbon({ from, to })` over rows whose
`from`/`to` columns hold refs (one band per row, after
[`resolve`](/js/api/operators/resolve)).

## Default grouping

A ribbon fused into a flow — in `.mark()` position or as `.layer()` sugar over
the previous tier's marks — splits at the flow's own grouping by default: one
tier lays the band's path, and every other grouping in the flow splits it into
separate bands. You don't restate the split — the flow one line up already
declared it, and `ribbon` has no option that spells the split directly.

When you need a _different_ path tier than the one inference would pick,
name it with `along`: `along: "year"` finds the flow tier whose `by` is
`"year"`, makes it the path, and splits by every other grouping tier instead.
Naming a field no tier groups by is an error. This doesn't apply to a ribbon
drawn over an explicit refs bag (`chart(selectAll(...))`) or the pairwise
`{ from, to }` form — `along` is only meaningful when the ribbon fuses into a
chart's own flow, and throws if used on either of those. A refs bag spells
its split structurally instead, with an upstream
`flow(group({ by: "species" }))`.

## Sugar: `.layer(ribbon(...))`

When the ribbon traces a chart's _own_ marks, skip the two-layer `selectAll`
recipe and chain [`.layer()`](/js/api/core/layer) on the builder —
this is the canonical simple ribbon-chart spelling:

```ts
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(rect({ h: "count", fill: "species" }))
  .layer(ribbon({ opacity: 0.8 }))
  .render(container, { h: 400 });
```

No `by` needed: the `stack({ by: "species" })` tier already told the flow how
to group, so the ribbon splits into one band per species by default.

See [`.layer()`](/js/api/core/layer) for the full semantics, including the
zBelow-by-default paint order and the desugaring to the explicit `layer([...])`

- `selectAll` form below (which is still what you want to trace _another_
  chart's marks).

## Sugar: `.mark(ribbon(...))` (blank-fusion)

When there's no earlier tier at all — just raw data that needs both fresh
anchors and a connector — place `ribbon(...)` directly in `.mark()` position
and skip `.layer()` too. This is the fused spelling of the
[Ridgeline chart](/js/examples/ridgeline-chart) gallery example:

```ts
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x", spacing: 64 }))
  .mark(ribbon({ h: "count", opacity: 0.8 }));

// ...is sugar for the explicit two-tier form:
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x", spacing: 64 }))
  .mark(blank({ h: "count" }))
  .layer(ribbon({ opacity: 0.8 }));
```

A grouped flow fuses the same way, with no `by` needed — a streamgraph is one
line:

```ts
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }),
    stack({ by: "species", dir: "y" })
  )
  .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }));
```

`fill` here is a shared field name, homogeneous within each species group
(the default split, above) — it resolves through the color scale per group,
the same as it would if `fill` were declared on an explicit anchor `blank()`.

See [`.layer()`'s blank-fusion section](/js/api/core/layer#blank-fusion-skip-layer-entirely-for-a-fresh-chart)
for the full desugaring rule (the `{w, h, emX, emY}` anchor/connector key
split, `.name()` chaining, and when the rule doesn't fire).

The `w`/`h`/`emX`/`emY` anchor channels are only meaningful when `ribbon` gets
to synthesize its own anchors this way; passing them to a `ribbon` that
instead connects already-drawn marks (an empty-scope `chart()` tier inside
`.layer()`, or `chart(selectAll(...))`/`chart(ref(...))`) is an error, since
there's nothing left for them to anchor.

## Example

```ts
chart(selectAll("bars"))
  .mark(ribbon({ opacity: 0.3 }))
  .render(container, { w: 500, h: 300 });
```
