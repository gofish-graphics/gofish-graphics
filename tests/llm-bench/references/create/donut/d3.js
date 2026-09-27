import * as d3 from "d3";

export default function render(container, data) {
  const width = 480;
  const height = 400;
  const radius = 160;

  const color = d3
    .scaleOrdinal(d3.schemeTableau10)
    .domain(data.map((d) => d.channel));
  const arcs = d3
    .pie()
    .sort(null)
    .value((d) => d.visits)(data);
  const arc = d3
    .arc()
    .innerRadius(radius / 2)
    .outerRadius(radius);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("transform", `translate(${radius + 20},${height / 2})`)
    .attr("stroke", "white")
    .selectAll("path")
    .data(arcs)
    .join("path")
    .attr("fill", (d) => color(d.data.channel))
    .attr("d", arc);

  const legend = svg
    .append("g")
    .attr("transform", `translate(${2 * radius + 60},${height / 2 - 50})`)
    .selectAll("g")
    .data(color.domain())
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);
  legend
    .append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", color);
  legend
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .attr("font-size", 12)
    .text((d) => d);
}
