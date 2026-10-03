import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: "store", dir: "x" }))
    .mark(
      rect({ h: "sales", fill: "steelblue" }).label(
        (rows) => rows[0].sales.toLocaleString("en-US"),
        { position: "outset" }
      )
    )
    .render(container, { w: 540, h: 305 });
}
