# How to use selection

Selection lets you connect marks across charts — for example, drawing a line
through scatterplot points or filling the area between stacked bars. It works in
two steps:

1. **Name a mark** using `.name("layerName")` to register its nodes
2. **Reference those nodes** using `selectAll("layerName")` (an array of
   [`ref`](/python/api/selection/ref)s) or `ref("layerName")` (a single ref) as
   data for another chart

`selectAll` is the `querySelectorAll` of GoFish — one ref per named node, never
flattened. `ref(name)` as data is the singular `querySelector`: it returns one
ref and raises if the layer matched zero or more than one node.

## Basic pattern

```python
layer([
    # Chart 1: create marks and name them
    chart(data)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value").name("bars")),

    # Chart 2: selectAll those marks as data for a connector
    chart(selectAll("bars")).mark(line()),
])
```

The `layer` function renders both charts in the same coordinate space, allowing
the second chart to overlay the first.

::: tip
For the common case of threading a connector through a chart's **own** marks,
[`.connect()`](/python/api/core/connect) is shorter sugar for this two-layer
recipe. Reach for the explicit `layer([...])` + `selectAll` form when connecting
a _different_ chart's marks or when you need a custom paint order.
:::

## Example: Connected scatterplot

[`line`](/python/api/marks/line) and [`area`](/python/api/marks/area) take an
array of refs directly and read placed geometry off them, so feed them
`selectAll`:

::: gofish example:connected-scatter-plot hidden
:::

```python
from gofish import layer, chart, scatter, circle, line, selectAll

layer([
    chart(driving_shifts)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2).name("points")),
    chart(selectAll("points")).mark(line(stroke="black", strokeWidth=2)),
]).render(w=400, h=250, axes=True)
```

The `line` mark connects all selected points in order.

## Example: Invisible blank with line

Sometimes you want a connecting line without visible points. Use
[`blank()`](/python/api/marks/blank) to create invisible anchor points:

::: gofish example:line-chart hidden
:::

```python
from gofish import layer, chart, scatter, blank, line, selectAll

layer([
    chart(catch_locations)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points")),
    chart(selectAll("points")).mark(line(stroke="steelblue", strokeWidth=2)),
]).render(w=400, h=250, axes=True)
```

## Example: Re-encoding a selection by its data

Connectors often need to re-partition the selected nodes — a ribbon/stream chart
draws one area **per species** through bars that were laid out **per lake**.
Because the selected stream is now refs (not raw records), you re-encode by the
**datum path**: `group(by="datum.species")` rather than `group(by="species")`.

::: gofish example:highlighted-ribbon-chart hidden
:::

```python
from gofish import layer, chart, spread, stack, derive, group, rect, area, selectAll

layer([
    chart(seafood)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            derive(lambda d: sorted(d, key=lambda r: r["count"], reverse=True)),
            stack(by="species", dir="y", label=False),
        )
        .mark(rect(h="count", fill="species").name("bars")),
    chart(selectAll("bars"))
        .flow(group(by="datum.species"))
        .mark(area(opacity=0.8)),
]).render(w=500, h=300, axes=True)
```

Here each bar is a single species row, so `datum.species` collapses cleanly to
one value. A `datum.field` path resolves only when every row in the ref's bag
agrees on that field (homogeneity collapse); if it is multi-valued the path is
`None` and you must disaggregate first. `by` also accepts a callable escape
hatch: `group(by=lambda r: r.datum.species)`. Note the asymmetry: `by` reads the
**selection stream** (refs, so `datum.` paths), while a mark's channel like
`rect(h="count")` reads the **raw record** and is _not_ path-prefixed. See
[path-aware `by`](/python/api/operators/spread#path-aware-by).

## Example: A single-node reference

When a layer holds exactly one node, `ref(name)` as **chart data** returns that
one ref — handy for diagrammatic annotations. It raises if the layer matched
more than one node, which catches mistakes early:

```python
from gofish import layer, chart, scatter, blank, text, ref, selectAll

layer([
    chart(data).flow(scatter(by="id", x="x", y="y")).mark(blank().name("origin")),
    # ref("origin") returns one ref; errors if "origin" matched 0 or >1 nodes
    chart(ref("origin")).mark(text(text="start")),
])
```

## How it works

When you call `.name("layerName")` on a mark, each node it produces is registered
in a shared layer context during rendering. `selectAll("layerName")` returns a
lazy selector that resolves, when the second chart renders, to one
[`ref`](/python/api/selection/ref) per registered node; `ref("layerName")` as
data resolves to the single ref (erroring otherwise).

Each ref:

- Points at the placed node, so overlay marks position themselves relative to it
- Exposes the bound datum via `ref.datum` — the raw bag of rows behind the node
  (a 1-row list if fully split, all the partition's rows if it is an auto-summed
  aggregate)

## Common use cases

| Goal                | Pattern                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| Line through points | `circle().name("points")` → `selectAll("points")` + `line()`                         |
| Area under line     | `blank().name("points")` → `selectAll("points")` + `area()`                          |
| Ribbon / stream     | `rect().name("bars")` → `selectAll("bars")` + `group(by="datum.species")` + `area()` |
| Single annotation   | Name one mark → `chart(ref("name"))` borrows that one node                           |
