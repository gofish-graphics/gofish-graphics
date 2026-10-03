import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no mosaic transform: lay the cells out with d3's treemap (columns
// by region, then rows by brand) in the unit square, and draw them as rects.
export default function render(container, data) {
  const root = d3
    .hierarchy(d3.group(data, (d) => d.region))
    .sum((d) => d.units);
  d3.treemap().tile(d3.treemapSliceDice)(root);
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { axis: null },
      y: { percent: true },
      color: { legend: true },
      marks: [
        Plot.rect(root.leaves(), {
          x1: "x0",
          x2: "x1",
          y1: "y0",
          y2: "y1",
          fill: (d) => d.data.brand,
          stroke: "white",
        }),
        Plot.text(root.children, {
          x: (d) => (d.x0 + d.x1) / 2,
          y: 0,
          text: (d) => d.data[0],
          lineAnchor: "top",
          dy: 6,
        }),
      ],
    })
  );
}
