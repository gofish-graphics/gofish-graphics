import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no mosaic transform: lay the cells out with d3's treemap in the
// unit square, alternating the split direction by level (class bands along
// y, sex along x, survived along y), and draw them as rects.
export default function render(container, data) {
  const root = d3
    .hierarchy(
      d3.group(
        data,
        (d) => d.class,
        (d) => d.sex,
        (d) => d.survived
      )
    )
    .sum((d) => d.count);
  d3
    .treemap()
    .tile((node, ...box) =>
      (node.depth % 2 ? d3.treemapDice : d3.treemapSlice)(node, ...box)
    )(root);
  container.append(
    Plot.plot({
      width: 560,
      height: 440,
      marginLeft: 60,
      axis: null,
      color: { legend: true },
      marks: [
        Plot.rect(root.leaves(), {
          x1: "x0",
          x2: "x1",
          y1: "y0",
          y2: "y1",
          fill: (d) => d.data.survived,
          stroke: "white",
        }),
        Plot.text(root.children, {
          x: 0,
          y: (d) => (d.y0 + d.y1) / 2,
          text: (d) => d.data[0],
          textAnchor: "end",
          dx: -6,
        }),
      ],
    })
  );
}
