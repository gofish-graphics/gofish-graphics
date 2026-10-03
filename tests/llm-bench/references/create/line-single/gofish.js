import { chart, scatter, line } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, {
    axes: {
      x: { title: "Year" },
      y: { title: "Wheat price (shillings)" },
    },
  })
    .flow(scatter({ by: "year", x: "year", y: "wheat" }))
    .mark(line({ stroke: "steelblue", strokeWidth: 2, curve: "linear" }))
    .render(container, { w: 540, h: 305 });
}
