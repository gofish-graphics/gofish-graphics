# join

One-to-many **equi-join** of the incoming rows against another data table on a
shared key. For each incoming (left) row, every `right` row whose `on` value
matches contributes one output row of the merged columns (`{**left, **right}`);
incoming rows with no match drop out. It's the relational join you know from
other tools:

| Language        | Equivalent                  |
| --------------- | --------------------------- |
| SQL             | `JOIN right USING (on)`     |
| pandas / polars | `left.merge(right, on=...)` |
| dplyr (R)       | `left_join(right, by = on)` |

Unlike [`resolve`](/python/api/operators/resolve) — which dereferences columns
into the _drawn nodes_ of a prior layer — `join` relates two plain data tables,
so the `right` table is inlined into the chart's IR and round-trips as JSON.

## Pie glyphs from a normalized join

A scatter of lakes by location, where each glyph inherits its lake row and joins
in that lake's catch rows to draw a polar pie — two normalized tables instead of
one denormalized array:

::: gofish example:scatter-plot-with-pie-glyphs hidden
:::

The nested glyph chart leaves off its data, so it inherits its parent partition
(the lake's row) and joins the catch table onto it:

```python
from gofish import chart, scatter, join, stack, rect, clock

chart(catch_locations).flow(scatter(by="lake", x="x", y="y")).mark(
    chart(coord=clock())  # no data -> inherits this lake's partition
    .flow(join(seafood, on="lake"), stack(by="species", dir="x", h=20))
    .mark(rect(w="count", fill="species"))
).render(w=400, h=400)
```

## Signature

```python
join(right, *, on) -> Operator
```

## Parameters

| Parameter | Type                     | Description                                                                                                                                      |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `right`   | `list[dict]` / dataframe | The right-hand table — row dicts, or any dataframe [narwhals](https://narwhals-dev.github.io/narwhals/) supports (pandas, polars, pyarrow, ...). |
| `on`      | `str`                    | The shared key field matched between the incoming rows and `right`.                                                                              |

A dataframe `right` is converted to records automatically. Returns an
`Operator` for use inside [`.flow()`](/python/api/core/flow).

## Semantics

- **One-to-many** — each incoming row fans out to one output row per matching
  `right` row. A left row matching three right rows yields three output rows.
- **Inner match** — incoming rows with no matching `right` row drop out (there is
  no left-outer "keep unmatched with nulls" mode).
- **Column merge** — output rows are `{**left, **right}`; on a column-name clash
  the `right` value wins.
- **Inlined right table** — `right` travels in the IR as JSON, so a chart using
  `join` serializes and round-trips without a bridge (contrast `derive`, whose
  function body cannot serialize).

## join vs. resolve

Both relate two tables on a key, but at different stages:

- [`join`](#join) relates two **data** tables before layout — the result is more
  data rows for the chart to draw.
- [`resolve`](/python/api/operators/resolve) relates a data table to a **drawn
  layer**, replacing reference columns with node refs that read each node's
  post-layout position (node-link edges, label anchoring).
