import * as Plot from "@observablehq/plot";

// Plot's hexbin transform bins in pixels, but the task fixes the bins in
// data units: bin by hand, and draw each hexagon as a closed, filled line
// through its six corners.
export default function render(container, data) {
  const sx = 100;
  const sy = 1000;
  const bins = new Map();
  for (const d of data) {
    const a = [
      Math.round(d.budget / sx) * sx,
      Math.round(d.box_office / sy) * sy,
    ];
    const b = [
      (Math.round(d.budget / sx - 0.5) + 0.5) * sx,
      (Math.round(d.box_office / sy - 0.5) + 0.5) * sy,
    ];
    const dist = ([cx, cy]) =>
      ((d.budget - cx) / sx) ** 2 + 3 * ((d.box_office - cy) / sy) ** 2;
    const [cx, cy] = dist(a) <= dist(b) ? a : b;
    const key = `${cx},${cy}`;
    if (!bins.has(key)) bins.set(key, { key, cx, cy, count: 0 });
    bins.get(key).count++;
  }
  const corners = [...bins.values()].flatMap(({ key, cx, cy, count }) =>
    [
      [0, sy / 3],
      [sx / 2, sy / 6],
      [sx / 2, -sy / 6],
      [0, -sy / 3],
      [-sx / 2, -sy / 6],
      [-sx / 2, sy / 6],
    ].map(([dx, dy]) => ({ key, count, x: cx + dx, y: cy + dy }))
  );
  container.append(
    Plot.plot({
      width: 600,
      height: 450,
      x: { label: "Budget (millions)" },
      y: { label: "Box office (millions)" },
      color: {
        type: "linear",
        scheme: "oranges",
        zero: true,
        legend: true,
        label: "Films",
      },
      marks: [
        Plot.line(corners, {
          x: "x",
          y: "y",
          z: "key",
          fill: "count",
          stroke: "white",
          strokeWidth: 0.5,
          curve: "linear-closed",
        }),
      ],
    })
  );
}
