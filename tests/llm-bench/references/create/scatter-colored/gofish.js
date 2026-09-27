import { chart, scatter, circle } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(scatter({ x: "bill_length_mm", y: "flipper_length_mm" }))
    .mark(circle({ r: 4, fill: "species" }))
    .render(container, { w: 440, h: 305 });
}
