import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot.tree places nodes by depth, not by height: build the tree with
// d3.stratify, put the leaves at 0, 1, 2, ... in depth-first order and each
// other node at the middle of its children, and draw the elbows as rules
// on a linear height axis.
export default function render(container, data) {
  const root = d3
    .stratify()
    .id((d) => d.name)
    .parentId((d) => d.parent || null)(data);
  const leaves = root.leaves();
  leaves.forEach((d, i) => (d.px = i));
  root.eachAfter((d) => {
    if (d.children)
      d.px =
        (d3.min(d.children, (c) => c.px) + d3.max(d.children, (c) => c.px)) / 2;
  });
  const inner = root.descendants().filter((d) => d.children);

  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginBottom: 40,
      x: { axis: null, inset: 30 },
      y: { label: "height", grid: true },
      marks: [
        // Up from each child to its parent's height.
        Plot.ruleX(root.links(), {
          x: (l) => l.target.px,
          y1: (l) => l.target.data.height,
          y2: (l) => l.source.data.height,
          stroke: "#555",
          strokeWidth: 1.5,
        }),
        // Across each parent's children at its height.
        Plot.ruleY(inner, {
          y: (d) => d.data.height,
          x1: (d) => d3.min(d.children, (c) => c.px),
          x2: (d) => d3.max(d.children, (c) => c.px),
          stroke: "#555",
          strokeWidth: 1.5,
        }),
        Plot.text(leaves, {
          x: "px",
          y: 0,
          text: "id",
          lineAnchor: "top",
          dy: 6,
        }),
      ],
    })
  );
}
