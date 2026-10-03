import { chart, scatter, circle } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, {
    axes: { x: { title: "Horsepower" }, y: { title: "Miles per gallon" } },
  })
    .flow(scatter({ x: "horsepower", y: "mpg" }))
    .mark(circle({ r: 4, fill: "steelblue", opacity: 0.7 }))
    .render(container, { w: 540, h: 305 });
}
