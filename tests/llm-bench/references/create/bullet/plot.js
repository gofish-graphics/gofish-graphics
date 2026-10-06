import * as Plot from "@observablehq/plot";

// Three bands end to end, a bar a third of the band tall, and a target tick
// across it. Insets are in pixels: the bands are about 48 px tall, so an
// inset of 16 px leaves the middle third.
export default function render(container, data) {
  const band = (x1, x2, fill) =>
    Plot.barX(data, { y: "category", x1, x2, fill });
  container.append(
    Plot.plot({
      width: 640,
      height: 300,
      marginLeft: 110,
      y: { domain: data.map((d) => d.category), padding: 0.35, label: null },
      x: { tickFormat: "~s", label: null },
      marks: [
        band(0, "poor", "#999999"),
        band("poor", "average", "#bbbbbb"),
        band("average", "good", "#dddddd"),
        Plot.barX(data, {
          y: "category",
          x: "sales",
          fill: "#333",
          insetTop: 16,
          insetBottom: 16,
        }),
        Plot.tickX(data, {
          y: "category",
          x: "target",
          stroke: "#d62728",
          strokeWidth: 3,
          insetTop: 8,
          insetBottom: 8,
        }),
      ],
    })
  );
}
