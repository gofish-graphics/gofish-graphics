import * as d3 from "d3";

export default function render(container, data) {
  const width = 600;
  const height = 400;

  // genre -> title, sized by gross; no padding, so the cells tile the chart
  const root = d3
    .hierarchy(d3.group(data, (d) => d.genre))
    .sum((d) => d.gross)
    .sort((a, b) => b.value - a.value);
  d3.treemap().size([width, height]).round(true)(root);

  const genres = [...new Set(data.map((d) => d.genre))];
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(genres);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("font-family", "sans-serif");

  const leaf = svg
    .append("g")
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

  leaf
    .append("rect")
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("fill", "none")
    .attr("stroke", "#ccc");

  // inscribed circle, 1px clear of the two long sides
  leaf
    .append("circle")
    .attr("cx", (d) => (d.x1 - d.x0) / 2)
    .attr("cy", (d) => (d.y1 - d.y0) / 2)
    .attr("r", (d) => Math.min(d.x1 - d.x0, d.y1 - d.y0) / 2 - 1)
    .attr("fill", (d) => color(d.data.genre));

  // genre names in the top-left corner of each genre rectangle
  svg
    .append("g")
    .selectAll("text")
    .data(root.children)
    .join("text")
    .attr("x", (d) => d.x0 + 4)
    .attr("y", (d) => d.y0 + 14)
    .attr("font-size", 12)
    .attr("font-weight", "bold")
    .attr("stroke", "white")
    .attr("stroke-width", 3)
    .attr("paint-order", "stroke")
    .text((d) => d.data[0]);
}
