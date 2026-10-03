import {
  chart,
  scatter,
  group,
  polygon,
  blank,
  gradient,
} from "gofish-graphics";

const W = 440; // plot width, px
const H = 380; // plot height, px
const RADIUS = 25; // px, center to corner
const X = [-50, 450]; // budget domain, pinned below
const Y = [1000, 4000]; // box office domain, pinned below
const ORANGES = gradient(["#fdd0a2", "#fd8d3c", "#7f2704"]);

// WORKAROUND: GoFish has no hexbin transform, so the bins and their
// hexagons are computed here, in pixels, as d3-hexbin does. That needs the
// scales in pixels, so the domains are pinned by invisible points at their
// ends: one budget unit is W / (X[1] - X[0]) px.
const toPx = (b, v) => [
  ((b - X[0]) / (X[1] - X[0])) * W,
  ((Y[1] - v) / (Y[1] - Y[0])) * H,
];
const toData = ([px, py]) => [
  X[0] + (px / W) * (X[1] - X[0]),
  Y[1] - (py / H) * (Y[1] - Y[0]),
];

function hexbins(rows) {
  const sx = Math.sqrt(3) * RADIUS; // centers in a row
  const sy = 3 * RADIUS; // rows of the same offset
  const bins = new Map();
  for (const d of rows) {
    // The nearer center of the two offset lattices.
    const [px, py] = toPx(d.budget, d.box_office);
    const a = [Math.round(px / sx) * sx, Math.round(py / sy) * sy];
    const b = [
      (Math.floor(px / sx) + 0.5) * sx,
      (Math.floor(py / sy) + 0.5) * sy,
    ];
    const dist = ([x, y]) => (px - x) ** 2 + (py - y) ** 2;
    const [cx, cy] = dist(a) <= dist(b) ? a : b;
    const key = `${cx},${cy}`;
    if (!bins.has(key)) bins.set(key, { key, cx, cy, count: 0 });
    bins.get(key).count++;
  }
  const cells = [...bins.values()];
  return cells.map(({ key, cx, cy, count }) => {
    const [x, y] = toData([cx, cy]);
    return {
      key,
      x,
      y,
      count,
      // pointy-top hexagon around the center, in data units
      ring: [0, 1, 2, 3, 4, 5].map((k) => {
        const t = (Math.PI / 3) * k;
        return toData([cx + RADIUS * Math.sin(t), cy - RADIUS * Math.cos(t)]);
      }),
    };
  });
}

export default function render(container, data) {
  const cells = hexbins(data);
  const frame = [
    { x: X[0], y: Y[0] },
    { x: X[1], y: Y[1] },
  ];
  return (
    chart(cells, {
      axes: {
        x: { title: "Budget (millions)" },
        y: { title: "Box office (millions)" },
      },
      color: ORANGES,
    })
      // one polygon per cell, its points in data units
      .flow(group({ by: "key" }))
      .mark(
        polygon({
          points: "ring",
          fill: "count",
          stroke: "white",
          strokeWidth: 0.5,
        })
      )
      // invisible points at the ends of both domains
      .layer(
        chart(frame)
          .flow(scatter({ by: "x", x: "x", y: "y" }))
          .mark(blank())
      )
      .render(container, { w: W, h: H })
  );
}
