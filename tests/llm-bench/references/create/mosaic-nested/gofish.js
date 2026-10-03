import {
  chart,
  stack,
  rect,
  text,
  layer,
  field,
  palette,
} from "gofish-graphics";

const W = 440;
const H = 380;

export default function render(container, data) {
  // WORKAROUND: `.label("class", { position: "outset-left" })` on the class
  // stack throws "Cannot unify underlying spaces with different measures"
  // on a three-level normalized mosaic, so the class names are a text layer
  // placed at each band's middle (text y is measured up from the bottom).
  const total = data.reduce((s, d) => s + d.count, 0);
  let below = 0;
  const labels = [...new Set(data.map((d) => d.class))].map((c) => {
    const n = data
      .filter((d) => d.class === c)
      .reduce((s, d) => s + d.count, 0);
    const mid = (below + n / 2) / total;
    below += n;
    return text({ x: -60, y: H * mid - 4, text: c });
  });

  return chart(data, { color: palette({ Yes: "#4e79a7", No: "#bab0ac" }) })
    .flow(
      // each level's size is its share of the cell above it
      stack({ by: "class", dir: "y", size: field("count").normalize() }),
      stack({ by: "sex", dir: "x", size: field("count").normalize() }),
      stack({ by: "survived", dir: "y", size: field("count").normalize() })
    )
    .mark(rect({ fill: "survived", stroke: "white", strokeWidth: 1 }))
    .layer(layer(labels))
    .render(container, { w: W, h: H });
}
