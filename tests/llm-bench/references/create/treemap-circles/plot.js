import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no treemap layout: tile genre -> title with d3.treemap in pixels,
// and draw the cells and circles with Plot marks on identity scales.
export default function render(container, data) {
  const root = d3
    .hierarchy(d3.group(data, (d) => d.genre))
    .sum((d) => d.gross)
    .sort((a, b) => b.value - a.value);
  d3.treemap().size([600, 400]).round(true)(root);
  const cells = root.leaves();
  container.append(
    Plot.plot({
      width: 600,
      height: 400,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      r: { type: "identity" },
      color: { legend: true },
      marks: [
        Plot.rect(cells, {
          x1: "x0",
          x2: "x1",
          y1: "y0",
          y2: "y1",
          stroke: "#ccc",
        }),
        Plot.dot(cells, {
          x: (d) => (d.x0 + d.x1) / 2,
          y: (d) => (d.y0 + d.y1) / 2,
          r: (d) => Math.min(d.x1 - d.x0, d.y1 - d.y0) / 2 - 1,
          fill: (d) => d.data.genre,
        }),
      ],
    })
  );
}
