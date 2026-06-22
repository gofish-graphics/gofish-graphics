# resolve

Dereference reference columns into the drawn nodes they name. For each row,
`resolve` matches the listed columns' values against the keyed nodes of `from_`
(a [`selectAll(...)`](/python/api/marks/ref) of a prior layer) and replaces each
value **in place** with the matching node ref — a many-to-one join that preserves
the row grain (no fan-out). It's the join that turns an edge or label table into
something the chart can draw.

Pair it with [`.layer(table)`](/python/api/core/layer) to drive a tier from a
second table, and with [`line(from_=, to=)`](/python/api/marks/line) (node-link
edges) or [`area(from_=, to=)`](/python/api/marks/area).

## Node-link edges

::: gofish example:node-link-diagram hidden
:::

```python
from gofish import chart, scatter, resolve, selectAll, circle, line

nodes = [
    {"id": "a", "grp": 0},
    {"id": "b", "grp": 1},
    {"id": "c", "grp": 1},
    {"id": "d", "grp": 2},
]
edges = [
    {"source": "a", "target": "b"},
    {"source": "a", "target": "c"},
    {"source": "b", "target": "d"},
    {"source": "c", "target": "d"},
]

chart(nodes).flow(scatter(by="id", x="grp", y="id")).mark(
    circle(r=14, fill="#4e79a7").name("nodes")
).layer(
    chart(edges)
    .flow(resolve(["source", "target"], from_=selectAll("nodes")))
    .mark(line(from_="source", to="target", stroke="#888"))
).render(w=360, h=360)
```

## Signature

```python
resolve(cols, *, from_, key=None) -> Operator
```

## Parameters

| Parameter | Type        | Description                                                                                                                            |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `cols`    | `list[str]` | The columns whose values are references to resolve in place.                                                                           |
| `from_`   | `GoFishRef` | A [`selectAll(layerName)`](/python/api/marks/ref) of the layer whose nodes the columns are matched against.                            |
| `key`     | `str`       | Optional. The field on the `from_` nodes to match against. Defaults to the field those nodes were grouped by (e.g. `scatter(by=...)`). |

`from_` carries a trailing underscore because `from` is a reserved word in
Python; it maps to the `from` wire key. Returns an `Operator` for use inside
[`.flow()`](/python/api/core/flow).

## Semantics

- **Many-to-one** — each reference resolves to exactly one node (the match field
  must be a key); the row grain is preserved, no rows are added.
- **In place** — the matched columns are replaced by node refs, so a downstream
  mark reads them directly (`line(from_="source", to="target")`).
- **Default key** — when `key` is omitted, the match field is the one the `from_`
  nodes were grouped by (`scatter(by="id")` ⇒ match on `id`). If those nodes
  were grouped by a function (no field name), pass an explicit `key`.
- **Errors** — a reference with no matching node throws, naming the column and
  value, rather than silently dropping the row.

## resolve vs. derive

[`derive`](/python/api/operators/derive) runs an opaque row transform; `resolve`
is the specific, named case of joining reference columns against a _drawn_ layer
and replacing them with refs that read each node's post-layout position.
