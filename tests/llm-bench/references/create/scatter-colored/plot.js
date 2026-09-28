import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      color: { legend: true },
      marks: [
        Plot.dot(data, {
          x: "bill_length_mm",
          y: "flipper_length_mm",
          stroke: "species",
        }),
      ],
    })
  );
}
