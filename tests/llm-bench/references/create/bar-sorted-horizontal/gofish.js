import { chart, spread, rect, field } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: field("site").sort("yield", "desc"), dir: "y" }))
    .mark(rect({ w: "yield", fill: "steelblue" }))
    .render(container, { w: 460, h: 305 });
}
