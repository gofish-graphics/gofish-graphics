import { chart, stack, rect, field } from "gofish-graphics";

export default function render(container, data) {
  return chart(data, { axes: { x: false, y: true } })
    .flow(
      // column widths: each region's total units; name each column below it
      stack({ by: "region", dir: "x", size: "units" }).label("region", {
        position: "outset-bottom",
      }),
      // segments fill the column by each brand's share
      stack({ by: "brand", dir: "y", size: field("units").normalize() })
    )
    .mark(rect({ fill: "brand", stroke: "white", strokeWidth: 1 }))
    .render(container, { w: 440, h: 300 });
}
