import * as Plot from "@observablehq/plot";

// Plot's difference mark fills between the line and zero, in one color
// where the line is above zero and another where it is below, and strokes
// the line itself.
export default function render(container, data) {
  const rows = data.map((d) => ({ ...d, date: new Date(d.date) }));
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginLeft: 60,
      y: { grid: true },
      marks: [
        Plot.differenceY(rows, {
          x: "date",
          y: "balance",
          positiveFill: "#2a9d8f",
          negativeFill: "#e76f51",
          stroke: "#222",
        }),
        Plot.ruleY([0]),
      ],
    })
  );
}
