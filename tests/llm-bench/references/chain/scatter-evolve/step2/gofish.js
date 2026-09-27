import { chart, scatter, circle } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, {
    axes: {
      x: { title: "Fuel economy (mpg)" },
      y: { title: "Engine power (hp)" },
    },
  })
    .flow(scatter({ x: "mpg", y: "horsepower" }))
    .mark(circle({ r: 4, fill: "steelblue", opacity: 0.7 }))
    .render(container, { w: 540, h: 305 });
}
