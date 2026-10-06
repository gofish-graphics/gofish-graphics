import { chart, spread, stack, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "question", dir: "y", spacing: 12 }),
      stack({ by: "answer", dir: "y", axes: false })
    )
    .mark(rect({ w: "count", fill: "answer" }))
    .render(container, { w: 400, h: 305 });
}
