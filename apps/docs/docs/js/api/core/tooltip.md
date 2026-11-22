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

| Parameter | Type       | Description                                                                                                                                                                                                     |
| --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`  | `string[]` | The fields the box shows, in order. Omitted, the box shows every field with one value on the mark, and each field a size or position channel draws, with the value it draws (a stacked segment's summed count). |

Returns the mark with the tooltip set. A field that is not in the mark's rows
is an error that names the fields there are. So is a listed field with more
than one value that no channel draws.

## Example

```js
chart(pathTypes)
  .flow(spread({ by: "path", dir: "y", spacing: 4 }))
  .mark(rect({ w: "share" }).tooltip(["path", "n", "share"]));
```

::: gofish example:bar-chart-with-tooltips hidden
:::

## Behavior

- **Focus.** The box describes the mark under the pointer. Off every mark,
  it describes the nearest one by where the layout placed it: a bar by its
  row, a dot by its center. A line is as near as its path. The box closes
  when the pointer is more than 8 px from the marks, or 12 px once a box is
  open. The open box keeps its mark until another one is 4 px nearer, and
  while the pointer is over the box. On a touch screen, a tap opens the box
  and it stays open.
- **Values.** Numbers show digit grouping and at most two fraction digits
  (`11,902`, `2.35`). A number below 1 shows three significant digits
  (`0.13`, `0.0119`). Dates show as a date, with the time when it is not
  midnight. A `line`'s or `ribbon`'s position fields read each row, so they
  show only when every row agrees.
- **Placement.** The box sits right of the mark, else left of it, centered
  on its row; else under or over it, flush with its end; else it is moved
  inside the chart. It paints over the marks, their labels and the axes. It
  takes no room, takes no pointer events, and moves nothing else.
- **Static output.** A drawing with no pointer (an exported SVG) draws no box.
  Each mark carries the same rows as its SVG `<title>`.

`.tooltip()` is a [mark modifier](/js/api/core/mark#modifiers), like `.name()`
and `.label()`, and it crosses the [IR](/internals/frontend/serialization) as
the mark's `tooltip` field.
