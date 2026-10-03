import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 30, right: 20, bottom: 30, left: 50 };

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.store))
    .range([margin.left, width - margin.right])
    .padding(0.2);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.sales)])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  svg
    .append("g")
    .attr("fill", "steelblue")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.store))
    .attr("y", (d) => y(d.sales))
    .attr("width", x.bandwidth())
    .attr("height", (d) => y(0) - y(d.sales));

  svg
    .append("g")
    .attr("font-size", 12)
    .attr("text-anchor", "middle")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("x", (d) => x(d.store) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.sales) - 6)
    .text((d) => d3.format(",")(d.sales));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}
