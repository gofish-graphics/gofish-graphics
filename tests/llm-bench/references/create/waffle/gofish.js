import { chart, derive, spread, rect, repeat } from "gofish-graphics";

export default function render(container, data) {
  return chart(data)
    .flow(
      // one row per square, in data order, then 10 squares per grid row
      derive((rows) => rows.flatMap((r) => repeat(r, "percent"))),
      derive((cells) =>
        Array.from({ length: 10 }, (_, i) => cells.slice(i * 10, i * 10 + 10))
      ),
      spread({ dir: "y", spacing: 3 }), // first row at the top
      spread({ dir: "x", spacing: 3 })
    )
    .mark(rect({ w: 26, h: 26, fill: "source" }))
    .render(container, {});
}
