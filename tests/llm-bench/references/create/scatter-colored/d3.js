import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 110, bottom: 40, left: 50 };

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.bill_length_mm))
    .nice()
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.flipper_length_mm))
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3
    .scaleOrdinal(d3.schemeTableau10)
    .domain([...new Set(data.map((d) => d.species))]);

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
        .attr("x", width - margin.right)
        .attr("y", 34)
        .attr("fill", "currentColor")
        .attr("text-anchor", "end")
        .text("bill_length_mm")
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
        .text("flipper_length_mm")
    );

  svg
    .append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(d.bill_length_mm))
    .attr("cy", (d) => y(d.flipper_length_mm))
    .attr("r", 4)
    .attr("fill", (d) => color(d.species));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`)
    .selectAll("g")
    .data(color.domain())
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);
  legend.append("circle").attr("r", 5).attr("cy", 5).attr("fill", color);
  legend
    .append("text")
    .attr("x", 12)
    .attr("y", 9)
    .attr("font-size", 12)
    .text((d) => d);
}
