import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  // Each bar's start and end on the value axis, and its kind.
  let total = 0;
  const bars = data.map((d, i) => {
    const start = i === 0 ? 0 : total;
    total += d.amount;
    return {
      label: d.label,
      start,
      end: total,
      kind: i === 0 ? "Total" : d.amount >= 0 ? "Increase" : "Decrease",
    };
  });
  bars.push({ label: "End", start: 0, end: total, kind: "Total" });

  container.append(
    Plot.plot({
      width: 560,
      height: 360,
      x: { domain: bars.map((d) => d.label), label: null, padding: 0.25 },
      y: { grid: true, label: null },
      color: {
        domain: ["Total", "Increase", "Decrease"],
        range: ["#115DAA", "#59a14f", "#e15759"],
      },
      marks: [
        Plot.barY(bars, { x: "label", y1: "start", y2: "end", fill: "kind" }),
        Plot.ruleY([0]),
      ],
    })
  );
}
