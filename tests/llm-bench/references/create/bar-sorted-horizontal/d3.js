import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 40, left: 110 };

  const totals = d3
    .rollups(
      data,
      (v) => d3.sum(v, (d) => d.yield),
      (d) => d.site
    )
    .map(([site, total]) => ({ site, total }))
    .sort((a, b) => d3.descending(a.total, b.total));

  const y = d3
    .scaleBand()
    .domain(totals.map((d) => d.site))
    .range([margin.top, height - margin.bottom])
    .padding(0.1);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(totals, (d) => d.total)])
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
    .attr("fill", "steelblue")
    .selectAll("rect")
    .data(totals)
    .join("rect")
    .attr("x", x(0))
    .attr("y", (d) => y(d.site))
    .attr("width", (d) => x(d.total) - x(0))
    .attr("height", y.bandwidth());

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}
