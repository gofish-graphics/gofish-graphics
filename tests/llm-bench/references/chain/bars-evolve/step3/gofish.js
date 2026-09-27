import { chart, spread, rect, field, palette } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, {
    axes: true,
    legend: false,
    color: palette({ highlight: "#f58518", other: "steelblue" }),
  })
    .flow(spread({ by: field("lake").sort("count", "desc"), dir: "y" }))
    .mark(
      rect({
        w: "count",
        fill: (d) => (d.lake === "Lake B" ? "highlight" : "other"),
      })
    )
    .render(container, { w: 540, h: 305 });
}
