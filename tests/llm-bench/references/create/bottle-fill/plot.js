import * as Plot from "@observablehq/plot";

// One facet per wine. y is the fill level in percent of the bottle's
// height: the body is 0-75 (150 of 200 px) and the neck 75-100.
const OUTLINE = [
  [0, 0],
  [60, 0],
  [60, 75],
  [40, 75],
  [40, 100],
  [20, 100],
  [20, 75],
  [0, 75],
];

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 560,
      height: 360,
      marginTop: 70,
      marginBottom: 90,
      fx: {
        domain: data.map((d) => d.wine),
        padding: 0.5,
        axis: "bottom",
        label: null,
      },
      x: { domain: [0, 60], axis: null },
      y: { domain: [0, 100], axis: null },
      marks: [
        // the liquid: the body up to the level, then the neck above 75%
        Plot.rect(data, {
          fx: "wine",
          x1: 0,
          x2: 60,
          y1: 0,
          y2: (d) => Math.min(d.fill_pct, 75),
          fill: "#4caf50",
        }),
        Plot.rect(data, {
          fx: "wine",
          x1: 20,
          x2: 40,
          y1: 75,
          y2: (d) => Math.max(d.fill_pct, 75),
          fill: "#4caf50",
        }),
        // no fx channel: the outline is drawn in every facet
        Plot.line(OUTLINE, {
          curve: "linear-closed",
          stroke: "#444",
          strokeWidth: 2,
        }),
        Plot.text(data, {
          fx: "wine",
          x: 30,
          y: 100,
          text: (d) => `${d.fill_pct}%`,
          lineAnchor: "bottom",
          dy: -8,
        }),
      ],
    })
  );
}
