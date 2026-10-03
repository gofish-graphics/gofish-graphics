import { chart, table, rect, gradient } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true, color: gradient("blues") })
    .flow(table({ by: { x: "age_range", y: "savings" }, spacing: 3 }))
    .mark(rect({ fill: "response_rate" }))
    .render(container, { w: 420, h: 340 });
}
