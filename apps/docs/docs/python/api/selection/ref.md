# ref / selectAll

`ref` is the single reference noun in GoFish, and it works in two positions:

- **Inline in a layout** — `arrow(ref("a"), ref("b"))` — it resolves at layout
  time against the name tree, hygienically scoped (see [scoping](#hygienic-scoping)).
- **As chart data** — `chart(ref("maxBar")).mark(text(...))` — it resolves at
  build time against the named-layer registry and stands in for the one node
  registered under that name.

`selectAll(name)` is the **plural** chart-data verb: it returns an **array of
refs**, one per node a named mark produced (node-unit; aggregate or not, no
flattening). Pass either form as the data argument to a second
[`chart()`](/python/api/core/chart) call to build overlays and connectors.

Think of `selectAll` as the DOM's `querySelectorAll` (always a collection) and
`ref(name)`-as-data as `querySelector` (the one-or-bust singular).

::: gofish example:line-chart hidden
:::

```python
from gofish import layer, chart, scatter, blank, selectAll, line

layer([
    # Step 1: name the mark
    chart(catch_locations)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points")),

    # Step 2: selectAll those nodes as data for a connector
    chart(selectAll("points")).mark(line(stroke="coral", strokeWidth=2)),
]).render(w=500, h=300, axes=True)
```

## Signature

```python
ref(name: str) -> Ref            # singular; resolves to exactly one node
selectAll(name: str) -> list[Ref]  # one ref per matching node
```

## Parameters

| Parameter | Type  | Description                                                             |
| --------- | ----- | ----------------------------------------------------------------------- |
| `name`    | `str` | The name of the layer to reference (registered via `.name()` on a mark) |

## Singular as data: exactly one

When you pass `ref(name)` as chart data it must resolve to **exactly one** node:

- **Zero matches → error.** Nothing was registered under that name in scope.
- **More than one match → error**, with a hint to use `selectAll(name)` instead.
  A named mark that produced several nodes is a collection, and the singular
  reference refuses to silently pick one.

```python
chart(ref("kpi")).mark(text(text="peak"))  # one ref; raises on 0 or >1 nodes
```

## Node-unit selection

`selectAll` selects at **node granularity**: one ref per node the named mark
produced, never flattened and never merged. Each ref points at a placed node, so
overlay marks position themselves relative to it, and a ref's `datum` is **that
node's data bag**.

```python
bars = selectAll("bars")  # list[Ref]
bars[0].datum             # the raw row-bag behind the first bar
```

The bag is a list of rows — a 1-row list for a fully-split leaf, all the
partition's rows for an auto-summed aggregate.

## Why a ref, not a "selection"?

GoFish models a selection as a plain list of refs rather than a bespoke
selection object, and this is deliberate:

- **A ref is structurally a one-element selection.** `ref(name)` (one ref) and
  `selectAll` (a list of refs) are the singular/plural of the very same noun, so
  there is nothing new to learn — the ref you get from a selection behaves
  exactly like a ref you wrote by hand inline.
- **Geometry is decoupled from data.** A ref points at a placed node; you read
  its placement off the ref (that is how `line` / `area` draw) and its bound
  datum via the ref's `datum`. Selecting does not flatten or reshape your data.
- **Batch operations live in `.flow`, not on the noun.** Unlike D3, where the
  selection object owns `.data()`, `.attr()`, `.filter()`, etc., GoFish keeps a
  selection inert. To partition, re-key, or re-encode a selection you run it
  through operators in `.flow` (e.g. `group`, `spread`) — see
  [path-aware `by`](#path-aware-by-after-a-selection) below.

## Hygienic scoping {#hygienic-scoping}

Layer-name lookup is **hygienic**: a name registered via `.name()` is visible
only within its scope and does **not** cross component boundaries. A name
registered on a mark inside a [`mark`](/python/api/core/mark) component is
internal to that component — it is not selectable from outside. This is the same
component-boundary rule that string-name `ref` resolution always followed
inline, so the inline-layout and chart-data lookup paths share one scoping rule.

## Inline `selectAll` is not supported yet

`selectAll` is a chart-data verb only. Using it inline inside a layout raises —
pass it as the data argument to a `chart()` instead. (Inline plural references
may arrive later; for now use a named layer + `selectAll` as data.)

## Connectors take `selectAll` directly

[`line`](/python/api/marks/line) and [`area`](/python/api/marks/area) consume a
list of refs and read placed geometry off them, so feed them `selectAll`:

```python
chart(selectAll("points")).mark(line(stroke="black"))
```

When the connector traces a chart's _own_ marks, the builder method
[`.connect()`](/python/api/core/connect) is sugar for this two-chart `selectAll`
recipe — only reach for `selectAll` by hand to connect _another_ chart's marks.

## Path-aware `by` after a selection {#path-aware-by-after-a-selection}

After `selectAll`, the stream items are refs, not raw records. Operators' `by`
option is path-aware, so re-encode by the **datum path**:

```python
chart(selectAll("bars")) \
    .flow(group(by="datum.species")) \
    .mark(area(opacity=0.8))
```

A `datum.field` path resolves to a scalar **only if every row in the ref's bag
agrees on that field** (homogeneity collapse — SQL's `ONLY_FULL_GROUP_BY` rule);
otherwise it is `None`. So `by="datum.lake"` works on lake-aggregate bars (all
rows share a lake) but `by="datum.species"` does not until you disaggregate. `by`
also accepts a callable as an escape hatch:
`group(by=lambda r: r.datum.species)`. See
[`spread` → path-aware `by`](/python/api/operators/spread#path-aware-by) for the
full explanation of why `by` is path-prefixed but mark channels are not.

::: info `pluck` is JavaScript only
The JS package exports `pluck(source, path)` — the un-collapsed counterpart to
`by`'s path projection, returning every distinct value present at a path. The
Python wrapper does not expose it yet ([issue #514](https://github.com/gofish-graphics/gofish-graphics/issues/514));
until then, enumerate multi-valued fields in a [`derive`](/python/api/operators/derive)
callback.
:::
