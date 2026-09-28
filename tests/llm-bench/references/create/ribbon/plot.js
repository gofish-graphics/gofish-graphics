import * as Plot from "@observablehq/plot";

// Bars 0.6 years wide on a numeric year axis. The ribbons are a stacked area
// through both edges of every bar: behind a bar it runs flat, and in each gap
// it connects one bar's segment to the next one's.
export default function render(container, data) {
  const edges = data.flatMap((d) =>
    [-0.3, 0.3].map((dx) => ({ ...d, x: +d.year + dx }))
  );
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { tickFormat: "d", ticks: 5, label: null },
      color: { legend: true },
      marks: [
        Plot.areaY(edges, {
          x: "x",
          y: "revenue",
          fill: "channel",
          fillOpacity: 0.35,
        }),
        Plot.rectY(data, {
          x1: (d) => +d.year - 0.3,
          x2: (d) => +d.year + 0.3,
          y: "revenue",
          fill: "channel",
        }),
        Plot.ruleY([0]),
      ],
    })
  );
}
