import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no packing layout: pack genre -> title with d3.pack in pixels,
// and draw the circles with Plot.dot on identity scales.
export default function render(container, data) {
  const root = d3
    .hierarchy(d3.group(data, (d) => d.genre))
    .sum((d) => d.gross)
    .sort((a, b) => b.value - a.value);
  d3.pack().size([520, 520]).padding(3)(root);
  container.append(
    Plot.plot({
      width: 520,
      height: 520,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      r: { type: "identity" },
      marks: [
        Plot.dot(root.children, {
          x: "x",
          y: "y",
          r: "r",
          fill: "#f4f4f4",
          stroke: "#999",
        }),
        Plot.dot(root.leaves(), {
          x: "x",
          y: "y",
          r: "r",
          fill: (d) => d.data.genre,
          stroke: "white",
        }),
        Plot.text(root.children, {
          x: "x",
          y: (d) => d.y - d.r,
          text: (d) => d.data[0],
          dy: 12,
          fontWeight: "bold",
        }),
      ],
    })
  );
}
