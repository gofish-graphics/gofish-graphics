import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { label: "Year", tickFormat: "d" },
      y: { label: "Wheat price (shillings)" },
      marks: [
        Plot.line(data, { x: "year", y: "wheat", sort: "year" }),
        Plot.dot(data, { x: "year", y: "wheat", fill: "currentColor" }),
      ],
    })
  );
}
