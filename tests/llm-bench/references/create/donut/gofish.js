import { chart, stack, rect, clock } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { coord: clock({ innerRadius: 0.5 }) })
    .flow(stack({ by: "channel", dir: "x" }))
    .mark(
      rect({ w: "visits", fill: "channel", stroke: "white", strokeWidth: 1 })
    )
    .render(container, { w: 320, h: 320 });
}
