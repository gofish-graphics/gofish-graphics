import { chart, spread, rect, derive, palette } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, {
    axes: true,
    color: palette({ negative: "#d62728", positive: "#4e79a7" }),
  })
    .flow(
      derive((rows) =>
        rows.map((d) => ({
          ...d,
          sign: d.profit_ratio < 0 ? "negative" : "positive",
        }))
      ),
      spread({ by: "sub_category", dir: "y" })
    )
    .mark(rect({ w: "profit_ratio", fill: "sign" }))
    .render(container, { w: 440, h: 420 });
}
