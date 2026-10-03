import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { domain: data.map((d) => d.store), label: null },
      marks: [
        Plot.barY(data, { x: "store", y: "sales", fill: "steelblue" }),
        Plot.text(data, {
          x: "store",
          y: "sales",
          text: "sales",
          lineAnchor: "bottom",
          dy: -4,
        }),
        Plot.ruleY([0]),
      ],
    })
  );
}
