import { chart, scatter, line, circle, filter } from "gofish-graphics";

export default function render(container, data) {
  const peak = data.reduce((a, b) => (b.visitors > a.visitors ? b : a));
  const label = `Peak: ${peak.visitors.toLocaleString("en-US")} in ${peak.year}`;
  return chart(data, {
    axes: { x: { title: "Year" }, y: { title: "Visitors (thousands)" } },
  })
    .flow(scatter({ by: "year", x: "year", y: "visitors" }))
    .mark(line({ stroke: "steelblue", strokeWidth: 2, curve: "linear" }))
    .layer(
      chart(data)
        .flow(
          filter((d) => d.year === peak.year),
          scatter({ x: "year", y: "visitors" })
        )
        .mark(
          circle({ r: 5, fill: "#d62728" }).label(() => label, {
            position: "outset-right",
          })
        )
    )
    .render(container, { w: 540, h: 305 });
}
