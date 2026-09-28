import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  const rows = data.map((d) => ({ ...d, date: new Date(d.date) }));
  container.append(
    Plot.plot({
      width: 640,
      height: 300,
      marginLeft: 110,
      inset: 20,
      y: {
        domain: [...new Set(data.map((d) => d.category))],
        label: null,
        grid: true,
      },
      x: { label: null },
      r: { range: [0, 18] },
      marks: [
        Plot.dot(rows, {
          x: "date",
          y: "category",
          r: "sales",
          fill: "category",
          fillOpacity: 0.8,
        }),
      ],
    })
  );
}
