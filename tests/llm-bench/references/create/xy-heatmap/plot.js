import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 720,
      height: 420,
      marginLeft: 230,
      padding: 0.04,
      x: { domain: [...new Set(data.map((d) => d.age_range))], label: null },
      y: { domain: [...new Set(data.map((d) => d.savings))], label: null },
      color: {
        type: "linear",
        scheme: "blues",
        legend: true,
        label: "Response rate (%)",
      },
      marks: [
        Plot.cell(data, {
          x: "age_range",
          y: "savings",
          fill: "response_rate",
        }),
      ],
    })
  );
}
