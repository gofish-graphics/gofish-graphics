import {
  chart,
  scatter,
  group,
  polygon,
  rect,
  gradient,
  assignGradientColor,
} from "gofish-graphics";

const SX = 100; // budget between neighboring centers in a row
const SY = 1000; // box office between rows of the same lattice
const ORANGES = gradient(["#fff5eb", "#fd8d3c", "#7f2704"]);

// WORKAROUND: GoFish has no hexbin transform, so the bins and their
// hexagons are computed here, in data units. Each film goes to the nearest
// center of the two offset lattices, by the task's scaled distance.
function hexbins(rows) {
  const bins = new Map();
  for (const d of rows) {
    const a = [
      Math.round(d.budget / SX) * SX,
      Math.round(d.box_office / SY) * SY,
    ];
    const b = [
      (Math.round(d.budget / SX - 0.5) + 0.5) * SX,
      (Math.round(d.box_office / SY - 0.5) + 0.5) * SY,
    ];
    const dist = ([cx, cy]) =>
      ((d.budget - cx) / SX) ** 2 + 3 * ((d.box_office - cy) / SY) ** 2;
    const [cx, cy] = dist(a) <= dist(b) ? a : b;
    const key = `${cx},${cy}`;
    if (!bins.has(key)) bins.set(key, { cx, cy, count: 0 });
    bins.get(key).count++;
  }
  const cells = [...bins.values()];
  const counts = cells.map((c) => c.count);
  const [lo, hi] = [Math.min(...counts), Math.max(...counts)];
  return cells.map(({ cx, cy, count }) => ({
    key: `${cx},${cy}`,
    cx,
    cy,
    count,
    // WORKAROUND: a polygon's `fill` is not a data channel, so the
    // sequential color is looked up here.
    color: assignGradientColor(ORANGES, (count - lo) / (hi - lo)),
    // pointy-top hexagon around the center, in data units
    ring: [
      [cx, cy + SY / 3],
      [cx + SX / 2, cy + SY / 6],
      [cx + SX / 2, cy - SY / 6],
      [cx, cy - SY / 3],
      [cx - SX / 2, cy - SY / 6],
      [cx - SX / 2, cy + SY / 6],
    ],
  }));
}

export default function render(container, data) {
  const cells = hexbins(data);
  return (
    chart(cells, {
      axes: {
        x: { title: "Budget (millions)" },
        y: { title: "Box office (millions)" },
      },
      color: ORANGES,
    })
      // a zero-size rect per cell colored by count, for the color bar
      .flow(scatter({ x: "cx", y: "cy" }))
      .mark(rect({ w: 0, h: 0, fill: "count" }))
      // one polygon per cell, its points in data units
      .layer(
        chart(cells)
          .flow(group({ by: "key" }))
          .mark((rows) =>
            polygon({
              points: "ring",
              fill: rows[0].color,
              stroke: "white",
              strokeWidth: 0.5,
            })(rows)
          )
      )
      .render(container, { w: 460, h: 380 })
  );
}
