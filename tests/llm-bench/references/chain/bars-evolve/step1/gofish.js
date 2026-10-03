import { chart, spread, rect, field } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: field("lake").sort("count", "desc"), dir: "x" }))
    .mark(rect({ h: "count", fill: "steelblue" }))
    .render(container, { w: 540, h: 305 });
}
