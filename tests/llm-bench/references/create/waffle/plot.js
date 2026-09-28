import * as Plot from "@observablehq/plot";

// One cell per percent, numbered row by row from the top-left. (Plot.waffleY
// draws each source as one pattern-filled shape, not as separate squares.)
export default function render(container, data) {
  const cells = data
    .flatMap((d) => Array.from({ length: d.percent }, () => d.source))
    .map((source, i) => ({ source, row: Math.floor(i / 10), col: i % 10 }));
  container.append(
    Plot.plot({
      width: 560,
      height: 400,
      margin: 0,
      marginLeft: 80,
      marginRight: 80,
      axis: null,
      color: { legend: true },
      marks: [
        Plot.cell(cells, { x: "col", y: "row", fill: "source", inset: 1.5 }),
      ],
    })
  );
}
