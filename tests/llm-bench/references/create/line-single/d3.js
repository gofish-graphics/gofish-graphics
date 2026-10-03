import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 45, left: 60 };

  const rows = [...data].sort((a, b) => a.year - b.year);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(rows, (d) => d.year))
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(rows, (d) => d.wheat))
    .nice()
    .range([height - margin.bottom, margin.top]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")))
    .call((g) =>
      g
        .append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", 38)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Year")
    );

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height - margin.bottom) / 2)
        .attr("y", -44)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Wheat price (shillings)")
    );

  svg
    .append("path")
    .datum(rows)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.year))
        .y((d) => y(d.wheat))
    );
}
