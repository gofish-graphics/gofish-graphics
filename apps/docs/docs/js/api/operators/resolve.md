# resolve

Dereference reference columns into the drawn nodes they name. For each row,
`resolve` matches the listed columns' values against the keyed nodes of `from`
(a [`selectAll(...)`](/js/api/marks/ref) of a prior layer) and replaces each
value **in place** with the matching node ref — a many-to-one join that preserves
the row grain (no fan-out). It's the join that turns an edge or label table into
something the chart can draw.

Pair it with [`.layer(table)`](/js/api/core/layer) to drive a tier from a second
table, and with [`line({ from, to })`](/js/api/marks/line) (node-link edges) or a
composing function-mark (labels).

## Node-link edges

::: gofish

```js
const nodes = [
  { id: "a", grp: 0 },
  { id: "b", grp: 1 },
  { id: "c", grp: 1 },
  { id: "d", grp: 2 },
];
const edges = [
  { source: "a", target: "b" },
  { source: "a", target: "c" },
  { source: "b", target: "d" },
  { source: "c", target: "d" },
];

gf.chart(nodes)
  .flow(gf.scatter({ by: "id", x: "grp", y: "id" }))
  .mark(gf.circle({ r: 14, fill: "#4e79a7" }).name("nodes"))
  .layer(
    gf
      .chart(edges)
      .flow(gf.resolve(["source", "target"], { from: gf.selectAll("nodes") }))
      .mark(gf.line({ from: "source", to: "target", stroke: "#888" }))
  )
  .render(root, { w: 360, h: 360 });
```

:::

## Signature

```ts
resolve(cols, { from, key? });
```

## Parameters

| Parameter | Type        | Description                                                                                                                           |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `cols`    | `string[]`  | The columns whose values are references to resolve in place.                                                                          |
| `from`    | `GoFishRef` | A [`selectAll(layerName)`](/js/api/marks/ref) of the layer whose nodes the columns are matched against.                               |
| `key`     | `string`    | Optional. The field on the `from` nodes to match against. Defaults to the field those nodes were grouped by (e.g. `scatter({ by })`). |

Returns an `Operator` for use inside [`.flow()`](/js/api/core/flow).

## Semantics

- **Many-to-one** — each reference resolves to exactly one node (the match field
  must be a key); the row grain is preserved, no rows are added.
- **In place** — the matched columns are replaced by node refs, so a downstream
  mark reads them directly (`line({ from: "source", to: "target" })`).
- **Default key** — when `key` is omitted, the match field is the one the `from`
  nodes were grouped by (`scatter({ by: "id" })` ⇒ match on `id`). If those nodes
  were grouped by a function (no field name), pass an explicit `key`.
- **Errors** — a reference with no matching node throws, naming the column and
  value, rather than silently dropping the row.

## resolve vs. derive

[`derive`](/js/api/operators/derive) runs an opaque row transform; `resolve` is
the specific, named case of joining reference columns against a _drawn_ layer and
replacing them with refs that read each node's post-layout position.
