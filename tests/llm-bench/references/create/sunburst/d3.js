import * as d3 from "d3";

export default function render(container, data) {
  const width = 520;
  const height = 520;
  const radius = 230;

  const root = d3
    .hierarchy(d3.group(data, (d) => d.region))
    .sum((d) => d.population ?? 0);
  d3.partition().size([2 * Math.PI, 3])(root);

  const regions = root.children.map((d) => d.data[0]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(regions);
  const regionOf = (d) => (d.depth === 1 ? d.data[0] : d.parent.data[0]);

  // Rings: depth 1 from 70 to 150 px, depth 2 from 150 to 230 px.
  const ring = [0, 70, 150, radius];
  const arc = d3
    .arc()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .innerRadius((d) => ring[d.depth])
    .outerRadius((d) => ring[d.depth + 1]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height]);

  svg
    .append("g")
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .selectAll("path")
    .data(root.descendants().filter((d) => d.depth > 0))
    .join("path")
    .attr("fill", (d) => {
      const c = color(regionOf(d));
      return d.depth === 1 ? c : d3.interpolateRgb(c, "white")(0.4);
    })
    .attr("d", arc);

  svg
    .append("g")
    .attr("font-size", 12)
    .attr("text-anchor", "middle")
    .selectAll("text")
    .data(root.children)
    .join("text")
    .attr("transform", (d) => {
      const [cx, cy] = arc.centroid(d);
      return `translate(${cx},${cy})`;
    })
    .attr("dy", "0.35em")
    .attr("fill", "white")
    .text((d) => d.data[0]);
}
