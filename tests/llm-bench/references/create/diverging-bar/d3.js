import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 480;
  const margin = { top: 20, right: 30, bottom: 30, left: 30 };

  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.sub_category))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);
  const x = d3
    .scaleLinear()
    .domain(d3.extent([0, ...data.map((d) => d.profit_ratio)]))
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
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(Math.min(0, d.profit_ratio)))
    .attr("y", (d) => y(d.sub_category))
    .attr("width", (d) => Math.abs(x(d.profit_ratio) - x(0)))
    .attr("height", y.bandwidth())
    .attr("fill", (d) => (d.profit_ratio < 0 ? "#d62728" : "#4e79a7"));

  // Names sit on the other side of zero from their bar.
  svg
    .append("g")
    .attr("font-size", 11)
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("x", (d) => x(0) + (d.profit_ratio < 0 ? 6 : -6))
    .attr("y", (d) => y(d.sub_category) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.profit_ratio < 0 ? "start" : "end"))
    .text((d) => d.sub_category);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
}
