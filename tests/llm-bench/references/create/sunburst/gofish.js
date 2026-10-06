import { chart, stack, rect, clock } from "gofish-graphics";

// The legend names the regions. (A `.label()` on the wedges would not help:
// GoFish's text marks do not go through the polar transform, so the labels
// pile up at one point.)
export default function render(container, data) {
  return (
    chart(data, { coord: clock() })
      // inner ring: one wedge per region, from radius 50 to 120
      .flow(stack({ by: "region", dir: "x", y: 50, h: 70 }))
      .mark(
        rect({
          w: "population",
          fill: "region",
          stroke: "white",
          strokeWidth: 1,
        })
      )
      // outer ring: the same angular stack, split by subregion, 120 to 190
      .layer(
        chart(data)
          .flow(
            stack({ by: "region", dir: "x", y: 120, h: 70 }),
            stack({ by: "subregion", dir: "x" })
          )
          .mark(
            rect({
              w: "population",
              fill: "region",
              opacity: 0.6,
              stroke: "white",
              strokeWidth: 1,
            })
          )
      )
      .render(container, { w: 400, h: 400 })
  );
}
