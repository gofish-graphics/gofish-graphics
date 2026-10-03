import { chart, spread, scatter, circle } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "month", dir: "y", spacing: 40 }),
      scatter({ by: "sub_category", x: "sales" })
    )
    .mark(circle({ r: 6, fill: "sub_category", opacity: 0.85 }))
    .render(container, { w: 480, h: 320 });
}
