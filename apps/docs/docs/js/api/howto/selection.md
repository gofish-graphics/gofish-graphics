# How to use selection

Selection lets you connect marks across charts—for example, drawing a line
through scatterplot points or filling the area between stacked bars. It works in
two steps:

1. **Name a mark** using `.name("layerName")` to register its nodes
2. **Reference those nodes** using `selectAll("layerName")` (an array of
   [`ref`](/js/api/marks/ref)s) or `ref("layerName")` (a single ref) as data
   for another chart

`selectAll` is the `querySelectorAll` of GoFish — one ref per named node, never
flattened. `ref(name)` as data is the singular `querySelector`: it returns one
ref and throws if the layer matched zero or more than one node.

## Basic pattern

```ts
layer([
  // Chart 1: create marks and name them
  chart(data)
    .flow(spread({ by: "category", dir: "x" }))
    .mark(rect({ h: "value" }).name("bars")),

  // Chart 2: selectAll those marks as data for a connector
  chart(selectAll("bars")).mark(line()),
]);
```

The `layer` function renders both charts in the same coordinate space, allowing
the second chart to overlay the first.

## Example: Connected scatterplot

[`line`](/js/api/marks/line) and [`area`](/js/api/marks/area) take an array of
refs directly and read placed geometry off them, so feed them `selectAll`:

::: gofish

```js
gf.layer([
  gf
    .chart(drivingShifts)
    .flow(gf.scatter({ by: "year", x: "miles", y: "gas" }))
    .mark(
      gf
        .circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 })
        .name("points")
    ),
  gf
    .chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "black", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

The `line` mark connects all selected points in order.

## Example: Invisible blank with line

Sometimes you want a connecting line without visible points. Use `blank()` to
create invisible anchor points:

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

## Example: Re-encoding a selection by its data

Connectors often need to re-partition the selected nodes — a ribbon/stream chart
draws one area **per species** through bars that were laid out **per lake**.
Because the selected stream is now refs (not raw records), you re-encode by the
**datum path**: `group({ by: "datum.species" })` rather than
`group({ by: "species" })`.

::: gofish

```js
gf.layer([
  gf
    .chart(seafood)
    .flow(
      gf.spread({ by: "lake", dir: "x", spacing: 64 }),
      gf.derive((d) => _.orderBy(d, "count", "desc")),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.rect({ h: "count", fill: "species" }).name("bars")),
  gf
    .chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "datum.species" }))
    .mark(gf.area({ opacity: 0.8 })),
]).render(root, { w: 500, h: 300, axes: true });
```

:::

Here each bar is a single species row, so `datum.species` collapses cleanly to
one value. A `datum.field` path resolves only when every row in the ref's bag
agrees on that field (homogeneity collapse); if it is multi-valued the path is
`undefined` and you must disaggregate first. `by` also accepts a function escape
hatch: `group({ by: (r) => r.datum.species })`. Note the asymmetry: `by` reads
the **selection stream** (refs, so `datum.` paths), while a mark's channel like
`rect({ h: "count" })` reads the **raw record** and is _not_ path-prefixed. See
[path-aware `by`](/js/api/operators/spread#path-aware-by).

## Example: A single-node reference

When a layer holds exactly one node, `ref(name)` as data returns that one ref —
handy for diagrammatic annotations. It throws if the layer matched more than one
node, which catches mistakes early.

```ts
layer([
  chart(data).flow(/* ... */).mark(blank().name("origin")),
  text({ text: "start" }).name("label"),
  // ref("origin") returns one ref; errors if "origin" matched 0 or >1 nodes
  Connect({ source: "middle" }, [ref("label"), ref("origin")]),
]);
```

## How it works

When you call `.name("layerName")` on a mark, each node it produces is
registered in a shared layer context during rendering. `selectAll("layerName")`
returns a lazy selector that resolves, when the second chart renders, to one
[`ref`](/js/api/marks/ref) per registered node; `ref("layerName")` as data
resolves to the single ref (erroring otherwise).

Each ref:

- Points at the placed node, so overlay marks position themselves relative to it
- Exposes the bound datum via [`ref.datum`](/js/api/marks/ref#datum) — the raw
  bag of rows behind the node (a 1-row array if fully split, all the partition's
  rows if it is an auto-summed aggregate)

## Common use cases

| Goal                | Pattern                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Line through points | `circle().name("points")` → `selectAll("points")` + `line()`                              |
| Area under line     | `blank().name("points")` → `selectAll("points")` + `area()`                               |
| Ribbon / stream     | `rect().name("bars")` → `selectAll("bars")` + `group({ by: "datum.species" })` + `area()` |
| Single annotation   | Name one mark → `ref("name")` as data → `ref` it from a connector                         |
