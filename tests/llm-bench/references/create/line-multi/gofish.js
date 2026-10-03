import { chart, group, scatter, line } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(
      group({ by: "country" }),
      scatter({ by: "year", x: "year", y: "life_expect" })
    )
    .mark(line({ stroke: "country", strokeWidth: 2, curve: "linear" }))
    .render(container, { w: 440, h: 305 });
}
