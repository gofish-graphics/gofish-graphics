import { chart, derive, spread, rect, repeat } from "gofish-graphics";

export default function render(container, data) {
  // the x axis only names the lakes, under the blocks
  return chart(data, {
    axes: { x: { side: "end", title: false } },
    legend: false,
  })
    .flow(
      // one block per lake, bottoms on a shared baseline
      spread({ by: "lake", dir: "x", spacing: 14, alignment: "end" }),
      // one row per fish, then rows of 5 squares
      derive((rows) => rows.flatMap((r) => repeat(r, "count"))),
      derive((cells) =>
        Array.from({ length: Math.ceil(cells.length / 5) }, (_, i) =>
          cells.slice(i * 5, i * 5 + 5)
        )
      ),
      spread({ dir: "y", spacing: 2, reverse: true }), // first row at the bottom
      spread({ dir: "x", spacing: 2 })
    )
    .mark(rect({ w: 9, h: 9, fill: "lake" }))
    .render(container, {});
}
