import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 300;
  const margin = { top: 20, right: 40, bottom: 30, left: 110 };

  const rows = data.map((d) => ({ ...d, date: new Date(d.date) }));
  const categories = [...new Set(rows.map((d) => d.category))];

  const x = d3
    .scaleUtc()
    .domain(d3.extent(rows, (d) => d.date))
    .range([margin.left + 20, width - margin.right - 20]);
  const y = d3
    .scalePoint()
    .domain(categories)
    .range([margin.top, height - margin.bottom])
    .padding(0.5);
  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(rows, (d) => d.sales)])
    .range([0, 18]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(categories);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("stroke", "#ccc")
    .selectAll("line")
    .data(categories)
    .join("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d));

  svg
    .append("g")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", (d) => x(d.date))
    .attr("cy", (d) => y(d.category))
    .attr("r", (d) => r(d.sales))
    .attr("fill", (d) => color(d.category))
    .attr("fill-opacity", 0.8);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(d3.utcYear.every(1)));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove());
}
