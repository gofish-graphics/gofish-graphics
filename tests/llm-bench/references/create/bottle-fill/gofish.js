import {
  chart,
  spread,
  rect,
  polygon,
  text,
  layer,
  mask,
  v,
} from "gofish-graphics";

// Local pixel coordinates, y up: a 60 x 150 body with a 20 x 50 neck.
const BOTTLE = [
  [0, 0],
  [60, 0],
  [60, 150],
  [40, 150],
  [40, 200],
  [20, 200],
  [20, 150],
  [0, 150],
];

export default function render(container, data) {
  return chart(data)
    .flow(
      spread({ by: "wine", dir: "x", spacing: 50 }).label("wine", {
        position: "outset-bottom",
      })
    )
    .mark(
      layer([
        // an invisible 100% bar pins the height scale: 100% is the plot's
        // full height, which render() sets to the bottle's 200 px
        rect({ w: 0, h: v(100) }),
        // the liquid: a bar as tall as the fill level, masked to the bottle
        mask([
          polygon({ points: BOTTLE, fill: "white" }),
          rect({ w: 60, h: "fill_pct", fill: "#4caf50" }),
        ]),
        polygon({
          points: BOTTLE,
          fill: "none",
          stroke: "#444",
          strokeWidth: 2,
        }),
        text({ y: 210, text: (d) => `${d.fill_pct}%` }),
      ])
    )
    .render(container, { h: 200 });
}
