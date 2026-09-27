import { chart, scatter, circle, palette } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, {
    legend: false,
    color: palette({ high: "#f58518", other: "steelblue" }),
    axes: {
      x: { title: "Fuel economy (mpg)" },
      y: { title: "Engine power (hp)" },
    },
  })
    .flow(scatter({ x: "mpg", y: "horsepower" }))
    .mark(
      circle({
        r: 4,
        fill: (d) => (d.mpg >= 30 ? "high" : "other"),
        opacity: 0.7,
      })
    )
    .render(container, { w: 540, h: 305 });
}
