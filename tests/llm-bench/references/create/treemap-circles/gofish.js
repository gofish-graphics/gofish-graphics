import {
  chart,
  treemap,
  layer,
  rect,
  circle,
  Constraint,
} from "gofish-graphics";

export default function render(container, data) {
  return (
    chart(data)
      .flow(
        // genre rectangles sized by total gross, then one cell per film
        treemap({ by: "genre", size: "gross" }),
        treemap({ by: "title", size: "gross" })
      )
      .mark(
        layer([
          rect({ fill: "none", stroke: "#ccc", strokeWidth: 1 }).name("cell"),
          circle({ fill: "genre" }).name("dot"),
        ]).relate(({ cell, dot }) => [
          // 1px inside the cell on each side: diameter = shorter side - 2px
          Constraint.nest({ x: 1, y: 1 }, [cell, dot]),
        ])
      )
      // the color legend names the genres
      .render(container, { w: 440, h: 320 })
  );
}
