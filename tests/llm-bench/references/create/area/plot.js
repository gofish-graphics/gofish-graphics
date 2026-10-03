import * as Plot from "@observablehq/plot";

// areaY stacks the categories from zero, in the order they first appear.
export default function render(container, data) {
  const rows = data.map((d) => ({ ...d, date: new Date(d.date) }));
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginLeft: 60,
      y: { grid: true, tickFormat: "~s" },
      color: { legend: true },
      marks: [
        Plot.areaY(rows, { x: "date", y: "sales", fill: "category" }),
        Plot.ruleY([0]),
      ],
    })
  );
}
