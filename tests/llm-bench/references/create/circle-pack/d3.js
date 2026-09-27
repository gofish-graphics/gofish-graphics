import * as d3 from "d3";

export default function render(container, data) {
  const width = 520;
  const height = 520;

  // genre -> title -> gross; d3.pack sizes leaves by area (sum of gross).
  const root = d3
    .hierarchy(d3.group(data, (d) => d.genre))
    .sum((d) => d.gross)
    .sort((a, b) => b.value - a.value);
  d3.pack().size([width, height]).padding(3)(root);

  const genres = [...new Set(data.map((d) => d.genre))];
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(genres);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("font-family", "sans-serif");

  svg
    .append("g")
    .selectAll("circle")
    .data(root.descendants().slice(1))
    .join("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => d.r)
    .attr("fill", (d) => (d.children ? "#f4f4f4" : color(d.data.genre)))
    .attr("stroke", (d) => (d.children ? "#999" : "white"));

  // genre names above each genre's circle
  svg
    .append("g")
    .selectAll("text")
    .data(root.children)
    .join("text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y - d.r + 12)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .attr("font-weight", "bold")
    .attr("stroke", "white")
    .attr("stroke-width", 3)
    .attr("paint-order", "stroke")
    .text((d) => d.data[0]);
}
