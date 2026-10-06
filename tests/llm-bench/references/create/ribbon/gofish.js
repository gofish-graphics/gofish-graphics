import { chart, spread, stack, rect, ribbon } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({ by: "year", dir: "x", spacing: 48 }),
      stack({ by: "channel", dir: "y" })
    )
    .mark(rect({ h: "revenue", fill: "channel" }))
    .layer(ribbon({ opacity: 0.5 }))
    .render(container, { w: 440, h: 300 });
}
