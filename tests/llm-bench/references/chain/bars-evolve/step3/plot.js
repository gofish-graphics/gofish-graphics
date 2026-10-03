import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginLeft: 60,
      marks: [
        Plot.barX(data, {
          y: "lake",
          x: "count",
          fill: (d) => (d.lake === "Lake B" ? "#f58518" : "steelblue"),
          sort: { y: "-x" },
        }),
        Plot.ruleX([0]),
      ],
    })
  );
}
