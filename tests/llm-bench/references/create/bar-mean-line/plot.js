import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

export default function render(container, data) {
  const mean = d3.mean(data, (d) => d.rain_mm);
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { domain: data.map((d) => d.month), label: null },
      marks: [
        Plot.barY(data, { x: "month", y: "rain_mm", fill: "steelblue" }),
        Plot.ruleY([0]),
        Plot.ruleY([mean], { strokeDasharray: "6 4" }),
        Plot.text([mean], {
          y: (d) => d,
          text: (d) => `Mean = ${d.toFixed(1)}`,
          frameAnchor: "right",
          lineAnchor: "bottom",
          dy: -4,
        }),
      ],
    })
  );
}
