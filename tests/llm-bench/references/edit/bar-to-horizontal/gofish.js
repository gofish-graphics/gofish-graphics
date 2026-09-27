import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: "lake", dir: "y" }))
    .mark(rect({ w: "count", fill: "steelblue" }))
    .render(container, { w: 540, h: 305 });
}
