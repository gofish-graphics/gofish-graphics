# tooltip

Shows a box that describes the mark under the pointer.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(gf.rect({ h: "count", fill: "species" }).tooltip())
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
mark.tooltip(fields?)
```

## Parameters

<!-- TODO(#1395): this table is handwritten because `gofish-ref` renders a
construct's own fields, and `tooltip` is a base field of every mark
(`MARK_BASE_FIELDS` in descriptors.ts), not one construct's. The right fix is
a `gofish-ref` form that renders one base field, so this table comes from the
field's `doc` like every other options table. -->

| Parameter | Type       | Description                                                                                                                                                                                                     |
| --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`  | `string[]` | The fields the box shows, in order. Omitted, the box shows every field with one value on the mark, and each field a size or position channel draws, with the value it draws (a stacked segment's summed count). |

Returns the mark with the tooltip set. A field that is not in the mark's rows
is an error that names the fields there are. So is a listed field with more
than one value that no channel draws. On a `line` drawn through rows, the listed
fields are the rows' fields: the box shows them for the row it describes,
leaving out any that row lacks, and the line's `<title>` shows only those
with one value on the whole line. A name that no row has is an error. A bare
string is a `TypeError`: one field is a list of one, `["lake"]`.

## Example

```js
chart(pathTypes)
  .flow(spread({ by: "path", dir: "y", spacing: 4 }))
  .mark(rect({ w: "share" }).tooltip(["path", "n", "share"]));
```

::: gofish example:bar-chart-with-tooltips hidden
:::

## Behavior

- **Focus.** The box describes only a mark whose drawn outline is within
  16 px of the pointer (a line's path, for a row of a line); the mark it
  describes stays in reach out to 20 px. With no mark in reach there is no
  box, so the hole of a donut and a wide gap between bars show none. Of the
  marks in reach, the box describes the one under the pointer, the one on
  top where marks overlap, and off every mark the nearest one by where the
  layout placed it: a bar by its row, a dot by its center. A line is as near
  as its path. On a `line` drawn through rows, the box describes the row
  whose point is nearest the pointer. The open box keeps its mark, and its
  row, until another is 4 px nearer. The box takes no pointer events, so a mark under it is reached as if it were
  not there, and over the box with no mark within reach it closes. On a touch screen, a tap opens the box
  and it stays open. A chart opens one box at a time: the marks of every
  `.tooltip()` in it are candidates together.
- **Values.** Numbers show digit grouping from five digits on and at most
  two fraction digits (`11,902`, `2018`, `2.35`). A number below 1 shows three significant digits
  (`0.13`, `0.0119`). Dates, and the values of a time column, show as a
  date, with the time when it is not midnight, in the time zone of the
  column's `Unit.time` (UTC when it has none), as its axis reads them. A `line`'s or `ribbon`'s position fields read each row, so they
  show only when every row agrees. A row of a `line` shows that row's
  fields, or the listed ones.
- **Placement.** The box sits right of the mark, else left of it, centered
  on its row; else under or over it, flush with its end; else it is moved
  inside the chart. A row's box sits the same way beside the row's point,
  with a dot in the line's color on the point. A line drawn from a function, or between marks,
  has no rows, and its box sits beside the end of the line. It paints over the marks, their labels and the axes. It
  takes no room, takes no pointer events, and moves nothing else.
- **Static output.** A drawing with no pointer (an exported SVG) draws no box.
  Each mark carries the same rows as its SVG `<title>`.

`.tooltip()` is a [mark modifier](/js/api/core/mark#modifiers), like `.name()`
and `.label()`, and it crosses the [IR](/internals/frontend/serialization) as
the mark's `tooltip` field.
