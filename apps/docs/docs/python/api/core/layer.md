# layer

Stack another tier over the current one. `.layer(child)` takes a whole
`chart(...)` pipeline as its argument: an **empty `chart()` scope** (no data)
inherits the previous tier's marks — so you can connect, group, or annotate what
you just drew without naming it — while `chart(table)` drives the tier from
another dataset. `.layer(...)` returns a `LayerBuilder`, so tiers keep chaining
(`.layer(a).layer(b)`); at render time they stack into one figure.

It generalizes [`.connect()`](/python/api/core/connect): where `.connect(line())`
threads a single ref-consuming mark under the chart, `.layer()` gives the next
tier a full `.flow().mark()` pipeline.

## Ribbon — empty scope inherits the previous marks

`chart()` with no data re-enters with the bars you just drew, grouped into bands
by [`group`](/python/api/operators/group):

::: gofish example:ribbon-chart hidden
:::

```python
from gofish import chart, spread, stack, group, rect, area

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x", spacing=64),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species")).layer(
    chart()  # empty scope = the previous tier's marks
    .flow(group(by="species"))
    .mark(ribbon(opacity=0.8))
).render(w=400, h=320)
```

## Node-link — a tier with its own data

Pass `chart(table)` to drive the tier from a different dataset, then
[`resolve`](/python/api/operators/resolve) its reference columns back into the
drawn nodes and connect them with [`line(from_=, to=)`](/python/api/marks/line):

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

## Annotation — a bare mark tier

Pass a bare mark (`text(...)`, `rect(...)`, …) instead of a `chart(...)` to add a
**component-level annotation tier**: a datumless overlay — a threshold rule, a
caption — with no data pipeline of its own. Its accessor channels ignore the
datum, so use plain values.

```python
from gofish import chart, spread, rect, text, datum

sales = [
    {"quarter": "Q1", "revenue": 30},
    {"quarter": "Q2", "revenue": 80},
    {"quarter": "Q3", "revenue": 55},
    {"quarter": "Q4", "revenue": 72},
]

chart(sales, axes=True).flow(spread(by="quarter", dir="x")).mark(
    rect(h="revenue", fill="#6b9bd1")
).layer(
    rect(y=datum(60), h=3, w=400, fill="#333")  # threshold rule (revenue units)
).layer(
    text(x=20, y=24, text="target: 60", fill="#333")  # caption
).render(w=400, h=300)
```

## Signature

```python
.layer(child: ChartBuilder | Mark) -> LayerBuilder
```

## Parameters

| Parameter | Type                   | Description                                                                                                                                                                                                                                                                                                      |
| --------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `child`   | `ChartBuilder \| Mark` | The next tier. A `chart(...)` pipeline stacks a data-driven tier — an empty `chart()` scope inherits the previous tier's marks; `chart(table)` drives it from another dataset (resolve back with [`resolve`](/python/api/operators/resolve)). A bare `Mark` is a component-level annotation overlay (datumless). |

Returns a `LayerBuilder` — chain `.layer(...)` again for more tiers, then
`.render()`.

## Semantics

- **Empty scope** — an empty `chart()` tier resolves to exactly the nodes the
  previous tier's mark produced, one per flow leaf. Under the hood `.layer()`
  names the previous tier's mark and binds the empty tier to
  `selectAll(thatName)` — the same wiring you'd write by hand, done for you.
- **Shared registry** — tiers resolve in order sharing one layer context, so a
  later tier's `selectAll("name")` finds an earlier tier's `.name("name")`.
- **Chart-level options** — axes and color from the root `chart(data, ...)` apply
  to the whole stack.
- **Paint order** — tiers paint in chain order (later tiers on top), like a
  manual [`layer([...])`](/python/api/operators/layer).
- **Field references on refs** — `by` / `resolve` read bare field names off the
  refs (`by="species"`, not `by="datum.species"`); a ref descends into its row
  bag automatically.

## `.layer(child)` vs. the `layer([...])` operator

This page documents the **v3 builder method** `ChartBuilder.layer(child)`, which
stacks a `chart(...)` tier over the current one and auto-wires an empty `chart()`
scope to the previous tier's marks. It's sugar over the lower-level
[`layer([...])` operator](/python/api/operators/layer) (which composes an explicit
list of already-built charts) — `.layer()` does the naming + `selectAll` wiring
for the common "draw, then build over what I drew" case.
