import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 45, left: 55 };

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.mpg))
    .nice()
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.horsepower))
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
    .call(d3.axisBottom(x))
    .call((g) =>
      g
        .append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", 38)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Fuel economy (mpg)")
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
        .attr("y", -40)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Engine power (hp)")
    );

  svg
    .append("g")
    .attr("fill-opacity", 0.7)
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("fill", (d) => (d.mpg >= 30 ? "#f58518" : "steelblue"))
    .attr("cx", (d) => x(d.mpg))
    .attr("cy", (d) => y(d.horsepower))
    .attr("r", 4);
}
