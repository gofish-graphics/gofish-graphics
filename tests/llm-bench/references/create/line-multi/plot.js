import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { tickFormat: "d" },
      color: { legend: true },
      marks: [
        Plot.line(data, { x: "year", y: "life_expect", stroke: "country" }),
      ],
    })
  );
}
