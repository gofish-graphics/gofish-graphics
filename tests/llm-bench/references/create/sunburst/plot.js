import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no partition layout or arc mark: lay out the rings with
// d3.partition, draw the wedges as d3.arc paths in a custom render of a
// mark whose fill goes through Plot's color scale, and place the region
// names with Plot.text on identity scales.
export default function render(container, data) {
  const width = 520;
  const height = 520;
  const root = d3
    .hierarchy(d3.group(data, (d) => d.region))
    .sum((d) => d.population ?? 0);
  d3.partition().size([2 * Math.PI, 3])(root);
  const nodes = root.descendants().filter((d) => d.depth > 0);
  const regionOf = (d) => (d.depth === 1 ? d.data[0] : d.parent.data[0]);

  // Rings: depth 1 from 70 to 150 px, depth 2 from 150 to 230 px.
  const ring = [0, 70, 150, 230];
  const arc = d3
    .arc()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .innerRadius((d) => ring[d.depth])
    .outerRadius((d) => ring[d.depth + 1]);

  container.append(
    Plot.plot({
      width,
      height,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      marks: [
        Plot.dot(nodes, {
          fill: regionOf,
          fillOpacity: (d) => (d.depth === 1 ? 1 : 0.6),
          frameAnchor: "middle",
          render: (index, scales, { fill, fillOpacity }) =>
            d3
              .create("svg:g")
              .attr("transform", `translate(${width / 2},${height / 2})`)
              .call((g) =>
                g
                  .selectAll("path")
                  .data(index)
                  .join("path")
                  .attr("d", (i) => arc(nodes[i]))
                  .attr("fill", (i) =>
                    d3.interpolateRgb(fill[i], "white")(1 - fillOpacity[i])
                  )
                  .attr("stroke", "white")
                  .attr("stroke-width", 0.5)
              )
              .node(),
        }),
        Plot.text(root.children, {
          x: (d) => width / 2 + arc.centroid(d)[0],
          y: (d) => height / 2 + arc.centroid(d)[1],
          text: (d) => d.data[0],
          fill: "white",
          fontSize: 12,
        }),
      ],
    })
  );
}
