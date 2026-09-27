import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 45, left: 50 };

  const x = d3
    .scaleLinear()
    .domain([170, 240])
    .range([margin.left, width - margin.right]);
  const bins = d3
    .bin()
    .value((d) => d.flipper_length_mm)
    .domain(x.domain())
    .thresholds(d3.range(180, 240, 10))(data);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (b) => b.length)])
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
    .attr("fill", "steelblue")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (b) => x(b.x0) + 1)
    .attr("width", (b) => x(b.x1) - x(b.x0) - 1)
    .attr("y", (b) => y(b.length))
    .attr("height", (b) => y(0) - y(b.length));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .call((g) =>
      g
        .append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", 38)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Flipper length (mm)")
    );

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("x", -margin.left)
        .attr("y", 10)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .text("Count")
    );
}
