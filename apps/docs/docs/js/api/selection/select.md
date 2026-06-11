# select / selectAll

`select` and `selectAll` are a verb pair that resolve the nodes registered by a
named mark (via `.name()`) into [`ref`](/js/api/marks/ref) values — the same
noun used everywhere else for cross-referencing geometry. Pass the result as the
data argument to a second [`chart()`](/js/api/core/chart) call to build overlays
and connectors.

- **`selectAll(name)`** returns an **array of refs** — exactly one ref per named
  mark node (aggregate or not; no flattening).
- **`select(name)`** returns a **single ref**, and throws if the layer matched
  zero or more than one node.

Think of them as the DOM's `querySelectorAll` (always a collection) and
`querySelector` (the one-or-bust singular).

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
select(layerName: string): GoFishRef;        // one ref; errors on 0 or >1
selectAll(layerName: string): GoFishRef[];   // one ref per matching node
```

## Parameters

| Parameter   | Type     | Description                                                          |
| ----------- | -------- | -------------------------------------------------------------------- |
| `layerName` | `string` | The name of the layer to select (registered via `.name()` on a mark) |

## Why a ref, not a "selection"?

GoFish models a selection as a plain array of [`ref`](/js/api/marks/ref)s rather
than a bespoke selection object, and this is deliberate:

- **A ref is structurally a one-element selection.** `select` (one ref) and
  `selectAll` (an array of refs) are the singular/plural of the very same noun,
  so there is nothing new to learn — the ref you get from a selection behaves
  exactly like a ref you wrote by hand.
- **Geometry is decoupled from data.** A ref points at a placed node; you read
  its placement off the ref (that is how `line`/`area` draw) and its bound datum
  via [`ref.datum`](/js/api/marks/ref#datum). Selecting does not flatten or
  reshape your data.
- **Batch operations live in `.flow`, not on the noun.** Unlike D3, where the
  selection object owns `.data()`, `.attr()`, `.filter()`, etc., GoFish keeps a
  selection inert. To partition, re-key, or re-encode a selection you run it
  through operators in `.flow` (e.g. `group`, `spread`) — see
  [path-aware `by`](#path-aware-by-after-a-selection) below.

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

## Single-node references

Use `select` (singular) when a layer holds exactly one node you want to point a
diagram element at:

```ts
gf.Layer([
  gf
    .Chart(data)
    .flow(/* ... */)
    .mark(gf.rect({ h: "total" }).name("kpi")),
  gf.text({ text: "peak" }).name("label"),
  // select returns one ref; throws if "kpi" matched 0 or >1 nodes
  gf.Connect({ source: "middle" }, [gf.ref("label"), gf.select("kpi")]),
]);
```
