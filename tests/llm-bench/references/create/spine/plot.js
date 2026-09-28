import * as Plot from "@observablehq/plot";

// Women to the left of zero, Men to the right, on one scale.
export default function render(container, data) {
  const genders = [...new Set(data.map((d) => d.gender))];
  container.append(
    Plot.plot({
      width: 560,
      height: 420,
      marginLeft: 110,
      y: { domain: [...new Set(data.map((d) => d.nationality))], label: null },
      x: { tickFormat: Math.abs, label: "percent", labelAnchor: "center" },
      color: { domain: genders, range: ["#e15759", "#4e79a7"], legend: true },
      marks: [
        Plot.barX(data, {
          x: (d) => (d.gender === genders[0] ? -d.percent : d.percent),
          y: "nationality",
          fill: "gender",
        }),
        Plot.ruleX([0]),
      ],
    })
  );
}
