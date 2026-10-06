import { chart, spread, scatter, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "sub_category", dir: "y", spacing: 30 }),
      scatter({ by: "state", x: "avg_sales" })
    )
    .mark(rect({ w: 2, h: 15, fill: "#4e79a7" }))
    .render(container, { w: 520, h: 240 });
}
