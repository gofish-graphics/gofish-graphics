import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: "lake", dir: "x" }))
    .mark(rect({ h: "count", fill: "steelblue" }))
    .render(container, { w: 540, h: 305 });
}
