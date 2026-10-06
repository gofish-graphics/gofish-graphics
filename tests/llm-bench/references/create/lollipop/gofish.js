import {
  chart,
  spread,
  rect,
  circle,
  layer,
  field,
  Constraint,
} from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      spread({
        by: field("region").sort("sales", "desc"),
        dir: "y",
        spacing: 48,
      })
    )
    .mark(
      // a stem from zero to the value, with the dot centered on its end
      layer([
        rect({ w: "sales", h: 2, fill: "#888" }).name("stem"),
        circle({ r: 7, fill: "#4e79a7" }).name("dot"),
      ]).relate(({ stem, dot }) => [
        Constraint.align({ x: ["end", "middle"], y: "middle" }, [stem, dot]),
      ])
    )
    .render(container, { w: 460, h: 260 });
}
