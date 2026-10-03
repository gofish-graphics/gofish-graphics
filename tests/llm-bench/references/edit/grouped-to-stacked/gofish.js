import { chart, spread, stack, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "lake", dir: "x", spacing: 16 }),
      stack({ by: "species", dir: "y" })
    )
    .mark(rect({ h: "count", fill: "species" }))
    .render(container, { w: 440, h: 305 });
}
