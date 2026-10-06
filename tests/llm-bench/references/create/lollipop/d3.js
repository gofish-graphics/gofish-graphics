import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 320;
  const margin = { top: 20, right: 30, bottom: 30, left: 70 };

  const rows = [...data].sort((a, b) => d3.descending(a.sales, b.sales));

  const y = d3
    .scalePoint()
    .domain(rows.map((d) => d.region))
    .range([margin.top, height - margin.bottom])
    .padding(0.5);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (d) => d.sales)])
    .nice()
    .range([margin.left, width - margin.right]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("stroke", "#888")
    .attr("stroke-width", 2)
    .selectAll("line")
    .data(rows)
    .join("line")
    .attr("x1", x(0))
    .attr("x2", (d) => x(d.sales))
    .attr("y1", (d) => y(d.region))
    .attr("y2", (d) => y(d.region));
  svg
    .append("g")
    .attr("fill", "#4e79a7")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", (d) => x(d.sales))
    .attr("cy", (d) => y(d.region))
    .attr("r", 7);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6, "~s"));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}
