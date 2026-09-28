import {
  chart,
  spread,
  scatter,
  rect,
  derive,
  field,
  palette,
} from "gofish-graphics";

export default function render(container, data) {
  // WORKAROUND (#773): `rect({ w: "profit_ratio" })` draws the negative bars
  // but its axis does not line up with them (the bars start at the data
  // minimum, the axis at its rounded tick), so each bar is placed by its
  // interval from zero instead.
  return chart(data, {
    axes: true,
    color: palette({ negative: "#d62728", positive: "#4e79a7" }),
  })
    .flow(
      derive((rows) =>
        rows.map((d) => ({
          ...d,
          from: Math.min(0, d.profit_ratio),
          to: Math.max(0, d.profit_ratio),
          sign: d.profit_ratio < 0 ? "negative" : "positive",
        }))
      ),
      spread({ by: "sub_category", dir: "y" }),
      scatter({
        xMin: field("from", "profit_ratio"),
        xMax: field("to", "profit_ratio"),
      })
    )
    .mark(rect({ fill: "sign" }))
    .render(container, { w: 440, h: 420 });
}
