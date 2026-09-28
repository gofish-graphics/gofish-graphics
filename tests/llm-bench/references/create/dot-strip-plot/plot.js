import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 380,
      marginLeft: 80,
      y: {
        domain: [...new Set(data.map((d) => d.month))],
        label: null,
        grid: true,
      },
      color: { legend: true },
      marks: [
        Plot.dot(data, {
          x: "sales",
          y: "month",
          fill: "sub_category",
          r: 6,
          fillOpacity: 0.85,
        }),
      ],
    })
  );
}
