import { chart, spread, rect, layer, field, Constraint } from "gofish-graphics";

export default function render(container, data) {
  // every width is in sales units, on one shared scale
  const sales = (name) => field(name, "sales");
  return chart(data, { axes: true })
    .flow(spread({ by: "category", dir: "y", spacing: 24 }))
    .mark(
      layer([
        // the bands, nested from zero: good, then average and poor on top
        rect({ w: sales("good"), h: 36, fill: "#dddddd" }).name("good"),
        rect({ w: sales("average"), h: 36, fill: "#bbbbbb" }).name("average"),
        rect({ w: sales("poor"), h: 36, fill: "#999999" }).name("poor"),
        rect({ w: "sales", h: 12, fill: "#333333" }).name("bar"),
        rect({ x: sales("target"), w: 3, h: 24, fill: "black" }).name("target"),
      ]).relate(({ good, average, poor, bar, target }) => [
        Constraint.align({ y: "middle" }, [good, average, poor, bar, target]),
      ])
    )
    .render(container, { w: 500, h: 200 });
}
