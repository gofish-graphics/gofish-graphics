import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marks: [
        Plot.barY(data, { x: "lake", y: "count", fill: "steelblue" }),
        Plot.ruleY([0]),
      ],
    })
  );
}
