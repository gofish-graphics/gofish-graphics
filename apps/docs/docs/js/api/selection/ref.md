# ref / selectAll

`ref` is the single reference noun in GoFish, and it works in two positions:

- **Inline in a layout** — `arrow(ref("a"), ref("b"))`, `ref(token).row[2]` — it
  resolves at layout time against the name tree, hygienically scoped (see
  [scoping](#hygienic-scoping)). This is the [`ref`](/js/api/marks/ref) mark.
- **As chart data** — `Chart(ref("maxBar")).mark(text(...))` — it resolves at
  build time against the named-layer registry and stands in for the one node
  registered under that name.

`selectAll(name)` is the **plural** chart-data verb: it returns an **array of
refs**, one per node a named mark produced (node-unit; aggregate or not, no
flattening). Pass either form as the data argument to a second
[`chart()`](/js/api/core/chart) call to build overlays and connectors.

Think of `selectAll` as the DOM's `querySelectorAll` (always a collection) and
`ref(name)`-as-data as `querySelector` (the one-or-bust singular).

::: starfish

```js
const lakeTotals = Object.entries(_.groupBy(seafood, "lake")).map(
  ([lake, items]) => ({
    lake,
    count: items.reduce((sum, item) => sum + item.count, 0),
  })
);

gf.Layer([
  // Step 1: name the mark
  gf
    .Chart(lakeTotals)
    .flow(gf.spread({ by: "lake", dir: "x" }))
    .mark(gf.rect({ h: "count" }).name("bars")),

  // Step 2: selectAll those nodes as data for a connector
  gf
    .Chart(gf.selectAll("bars"))
    .mark(gf.line({ stroke: "coral", strokeWidth: 2 })),
]).render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
ref(name: string): GoFishRef;                // singular; see ref mark for all forms
selectAll(layerName: string): GoFishRef[];   // one ref per matching node
```

`ref` has several other inline forms (Token, path, direct node) — see the
[`ref` mark](/js/api/marks/ref) for the full signature. This page covers its use
as chart data alongside `selectAll`.

## Parameters

| Parameter | Type     | Description                                                             |
| --------- | -------- | ----------------------------------------------------------------------- |
| `name`    | `string` | The name of the layer to reference (registered via `.name()` on a mark) |

## Singular as data: exactly one

When you pass `ref(name)` as chart data it must resolve to **exactly one** node:

- **Zero matches → error.** Nothing was registered under that name in scope.
- **More than one match → error**, with a hint to use `selectAll(name)` instead.
  A named mark that produced several nodes is a collection, and the singular
  reference refuses to silently pick one.

```ts
gf.Layer([
  gf
    .Chart(data)
    .flow(/* ... */)
    .mark(gf.rect({ h: "total" }).name("kpi")),
  gf.text({ text: "peak" }).name("label"),
  // ref("kpi") as the connector's target: one ref; throws on 0 or >1 nodes
  gf.Connect({ source: "middle" }, [gf.ref("label"), gf.ref("kpi")]),
]);
```

## Node-unit selection

`selectAll` selects at **node granularity**: one ref per node the named mark
produced, never flattened and never merged. Each ref points at a placed node, so
overlay marks position themselves relative to it, and `ref.datum` is **that
node's data bag**.

```ts
const bars = gf.selectAll("bars"); // GoFishRef[]
bars[0].datum; // the raw row-bag behind the first bar
```

See [`ref.datum`](/js/api/marks/ref#datum) for what the bag contains (a 1-row
array for a fully-split leaf, all the partition's rows for an auto-summed
aggregate).

## Why a ref, not a "selection"?

GoFish models a selection as a plain array of [`ref`](/js/api/marks/ref)s rather
than a bespoke selection object, and this is deliberate:

- **A ref is structurally a one-element selection.** `ref(name)` (one ref) and
  `selectAll` (an array of refs) are the singular/plural of the very same noun,
  so there is nothing new to learn — the ref you get from a selection behaves
  exactly like a ref you wrote by hand inline.
- **Geometry is decoupled from data.** A ref points at a placed node; you read
  its placement off the ref (that is how `line`/`area` draw) and its bound datum
  via [`ref.datum`](/js/api/marks/ref#datum). Selecting does not flatten or
  reshape your data.
- **Batch operations live in `.flow`, not on the noun.** Unlike D3, where the
  selection object owns `.data()`, `.attr()`, `.filter()`, etc., GoFish keeps a
  selection inert. To partition, re-key, or re-encode a selection you run it
  through operators in `.flow` (e.g. `group`, `spread`) — see
  [path-aware `by`](#path-aware-by-after-a-selection) below.

## Hygienic scoping {#hygienic-scoping}

Layer-name lookup is **hygienic**: a name registered via `.name()` is visible
only within its scope and does **not** cross component boundaries. A name
registered on a mark inside a [`createMark`](/js/api/core/mark) component is
internal to that component — it is not selectable from outside. This is the same
component-boundary rule that string-name `ref` resolution always followed
inline, so the inline-layout and chart-data lookup paths now share one scoping
rule.

## Inline `selectAll` is not supported yet

`selectAll` is a chart-data verb only. Using it inline inside a layout throws —
pass it as the data argument to a `chart()` instead. (Inline plural references
may arrive later; for now use a named layer + `selectAll` as data.)

## Connectors take `selectAll` directly

[`line`](/js/api/marks/line) and [`area`](/js/api/marks/area) consume an array
of refs and read placed geometry off them, so feed them `selectAll`:

```ts
gf.Chart(gf.selectAll("points")).mark(gf.line({ stroke: "black" }));
```

## Path-aware `by` after a selection {#path-aware-by-after-a-selection}

After `selectAll`, the stream items are refs, not raw records. Operators' `by`
option is path-aware (lodash `_.get`), so re-encode by the **datum path**:

```ts
gf.Chart(gf.selectAll("bars"))
  .flow(gf.group({ by: "datum.species" })) // not "species"
  .mark(gf.area({ opacity: 0.8 }));
```

A `datum.field` path resolves to a scalar **only if every row in the ref's bag
agrees on that field** (homogeneity collapse — SQL's `ONLY_FULL_GROUP_BY` rule);
otherwise it is `undefined`. So `by: "datum.lake"` works on lake-aggregate bars
(all rows share a lake) but `by: "datum.species"` does not until you
disaggregate. `by` also accepts a function as an escape hatch:
`group({ by: (r) => r.datum.species })`. See
[`spread`](/js/api/operators/spread#path-aware-by) for the full explanation of
why `by` is path-prefixed but mark channels are not.

## `pluck(source, path)` — every value at a path {#pluck}

Where `by`'s path projection **collapses** a row-bag to a single scalar (and goes
`undefined` when the bag disagrees), `pluck` is its un-collapsed counterpart: it
returns the full set of **distinct values** present at a path — "every possible
value here."

```ts
import { pluck } from "gofish-graphics";

pluck(ref, "species"); // → ["Bass", "Trout", ...] (distinct across the bag)
```

`source` may be a [`ref`](/js/api/marks/ref) (reads its
[`.datum`](/js/api/marks/ref#datum) bag), a row array, or a single row. Reach for
`pluck` when a field is multi-valued in the current bag and you want to enumerate
its values rather than group by it — the case where `by: "datum.field"` would
resolve to `undefined`.

::: info JavaScript only
`pluck` is exported from the JS package (`gofish-graphics`). The Python wrapper
does not expose it yet.
:::
