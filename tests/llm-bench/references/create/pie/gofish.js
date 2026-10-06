import { chart, stack, rect, clock } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { coord: clock() })
    .flow(stack({ by: "category", dir: "x" }))
    .mark(
      rect({ w: "amount", fill: "category", stroke: "white", strokeWidth: 1 })
    )
    .render(container, { w: 320, h: 320 });
}
