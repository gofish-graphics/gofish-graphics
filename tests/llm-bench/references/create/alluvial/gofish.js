import {
  chart,
  spread,
  stack,
  group,
  rect,
  blank,
  ribbon,
  selectAll,
} from "gofish-graphics";

const STEPS = ["class", "survival", "gender"];
const NODE_W = 64;

export default function render(container, data) {
  // the columns and, inside each, the nodes top to bottom in order of
  // first appearance
  const columns = () => [
    spread({ by: "step", dir: "x", spacing: 110 }),
    spread({ by: "category", dir: "y", spacing: 12, reverse: true }),
  ];
  // one lode per row and step, so each row's ribbon runs through every
  // column; inside a node the lodes keep the data's order, so a ribbon
  // leaves a survival node at the height at which it arrives
  const lodes = data.flatMap((d, id) =>
    STEPS.map((s) => ({ ...d, id, step: s, category: d[s] }))
  );
  return (
    chart(lodes)
      .flow(...columns(), stack({ by: "id", dir: "y", reverse: true }))
      .mark(blank({ w: NODE_W, h: "count" }).name("lodes"))
      // one ribbon per row, through its lodes left to right
      .layer(
        chart(selectAll("lodes"))
          .flow(group({ by: "id" }))
          .mark(ribbon({ fill: "class", opacity: 0.5 }))
      )
      // the nodes: one rect per category, the same layout without the lodes
      .layer(
        chart(lodes)
          .flow(...columns())
          .mark(
            rect({ w: NODE_W, h: "count", fill: "#555" }).label("category", {
              position: "center",
              fill: "white",
              fontSize: 11,
            })
          )
      )
      .render(container, { w: 460, h: 380 })
  );
}
