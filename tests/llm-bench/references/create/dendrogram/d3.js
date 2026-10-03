import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };

  const root = d3
    .stratify()
    .id((d) => d.name)
    .parentId((d) => d.parent || null)(data);

  // Leaves evenly spaced in depth-first order; each other node at the
  // middle of its children.
  const leaves = root.leaves();
  const x = d3
    .scalePoint()
    .domain(leaves.map((d) => d.id))
    .range([margin.left, width - margin.right])
    .padding(0.5);
  root.eachAfter((d) => {
    d.px = d.children
      ? (d3.min(d.children, (c) => c.px) + d3.max(d.children, (c) => c.px)) / 2
      : x(d.id);
  });
  const y = d3
    .scaleLinear()
    .domain([0, root.data.height])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  // One elbow per child: up from the child, then across to the parent.
  svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-width", 1.5)
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr(
      "d",
      ({ source, target }) =>
        `M${target.px},${y(target.data.height)}V${y(source.data.height)}H${source.px}`
    );

  svg
    .append("g")
    .attr("font-size", 12)
    .attr("text-anchor", "middle")
    .selectAll("text")
    .data(leaves)
    .join("text")
    .attr("x", (d) => d.px)
    .attr("y", y(0) + 16)
    .text((d) => d.id);

  svg
    .append("g")
    .attr("transform", `translate(${margin.left - 20},0)`)
    .call(d3.axisLeft(y));
}
