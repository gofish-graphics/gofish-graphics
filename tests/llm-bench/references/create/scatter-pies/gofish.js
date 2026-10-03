import { chart, scatter, stack, rect, clock } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(scatter({ by: "lake", x: "x", y: "y" }))
    .mark(
      // a nested chart per lake: it inherits that lake's rows, and draws
      // them as a pie (stack along the angle, 20 px radius)
      chart({ coord: clock() })
        .flow(stack({ by: "species", dir: "x", h: 20 }))
        .mark(rect({ w: "count", fill: "species" }))
    )
    .render(container, { w: 420, h: 360 });
}
