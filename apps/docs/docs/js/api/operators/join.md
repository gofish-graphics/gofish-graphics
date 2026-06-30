# join

One-to-many **equi-join** of the incoming rows against another data table on a
shared key. For each incoming (left) row, every `right` row whose `on` value
matches contributes one output row of the merged columns (`{ ...left, ...right }`);
incoming rows with no match drop out. It's the relational join you know from
other tools:

| Language        | Equivalent                  |
| --------------- | --------------------------- |
| SQL             | `JOIN right USING (on)`     |
| pandas / polars | `left.merge(right, on=...)` |
| dplyr (R)       | `left_join(right, by = on)` |

Unlike [`resolve`](/js/api/operators/resolve) — which dereferences columns into
the _drawn nodes_ of a prior layer — `join` relates two plain data tables, so the
`right` table is inlined into the chart's IR and round-trips as JSON.

## Pie glyphs from a normalized join

A scatter of lakes by location, where each glyph inherits its lake row and joins
in that lake's catch rows to draw a polar pie — two normalized tables instead of
one denormalized array:

::: gofish example:scatter-plot-with-pie-glyphs
:::

The nested glyph chart leaves off its data, so it inherits its parent partition
(the lake's row) and joins the catch table onto it:

```js
gf.chart(catchLocationsArray)
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(
    gf
      .chart({ coord: gf.clock() }) // no data → inherits this lake's partition
      .flow(
        gf.join(seafood, { on: "lake" }),
        gf.stack({ by: "species", dir: "x", h: 20 })
      )
      .mark(gf.rect({ w: "count", fill: "species" }))
  )
  .render(root, { w: 400, h: 400 });
```

## Signature

```ts
join(right, { on });
```

## Parameters

| Parameter | Type       | Description                                                          |
| --------- | ---------- | -------------------------------------------------------------------- |
| `right`   | `object[]` | The right-hand table — an array of row objects, inlined into the IR. |
| `on`      | `string`   | The shared key field matched between the incoming rows and `right`.  |

Returns an `Operator` for use inside [`.flow()`](/js/api/core/flow).

## Semantics

- **One-to-many** — each incoming row fans out to one output row per matching
  `right` row. A left row matching three right rows yields three output rows.
- **Inner match** — incoming rows with no matching `right` row drop out (there is
  no left-outer "keep unmatched with nulls" mode).
- **Column merge** — output rows are `{ ...left, ...right }`; on a column-name
  clash the `right` value wins.
- **Inlined right table** — `right` travels in the IR as JSON, so a chart using
  `join` serializes and round-trips without a bridge (contrast `derive`, whose
  function body cannot serialize).

## join vs. resolve

Both relate two tables on a key, but at different stages:

- [`join`](#join) relates two **data** tables before layout — the result is more
  data rows for the chart to draw.
- [`resolve`](/js/api/operators/resolve) relates a data table to a **drawn
  layer**, replacing reference columns with node refs that read each node's
  post-layout position (node-link edges, label anchoring).
