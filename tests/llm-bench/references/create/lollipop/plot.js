import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 560,
      height: 320,
      marginLeft: 70,
      x: { grid: true, tickFormat: "~s" },
      y: { label: null },
      marks: [
        Plot.ruleY(data, {
          y: "region",
          x1: 0,
          x2: "sales",
          stroke: "#888",
          strokeWidth: 2,
          sort: { y: "-x2" },
        }),
        Plot.dot(data, { x: "sales", y: "region", r: 7, fill: "#4e79a7" }),
      ],
    })
  );
}
