import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 300;
  const margin = { top: 20, right: 30, bottom: 30, left: 110 };

  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.category))
    .range([margin.top, height - margin.bottom])
    .padding(0.35);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => Math.max(d.good, d.sales, d.target))])
    .nice()
    .range([margin.left, width - margin.right]);
  const shades = { good: "#dddddd", average: "#bbbbbb", poor: "#999999" };

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  const bullet = svg
    .append("g")
    .selectAll("g")
    .data(data)
    .join("g")
    .attr("transform", (d) => `translate(0,${y(d.category)})`);

  // Bands nested from zero, widest (lightest) first.
  for (const key of ["good", "average", "poor"])
    bullet
      .append("rect")
      .attr("x", x(0))
      .attr("width", (d) => x(d[key]) - x(0))
      .attr("height", y.bandwidth())
      .attr("fill", shades[key]);
  bullet
    .append("rect")
    .attr("x", x(0))
    .attr("y", y.bandwidth() / 3)
    .attr("width", (d) => x(d.sales) - x(0))
    .attr("height", y.bandwidth() / 3)
    .attr("fill", "#333");
  bullet
    .append("line")
    .attr("x1", (d) => x(d.target))
    .attr("x2", (d) => x(d.target))
    .attr("y1", y.bandwidth() * 0.15)
    .attr("y2", y.bandwidth() * 0.85)
    .attr("stroke", "#d62728")
    .attr("stroke-width", 3);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6, "~s"));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove());
}
