import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 45, left: 60 };

  const rows = [...data].sort((a, b) => a.year - b.year);
  const peak = rows[d3.maxIndex(rows, (d) => d.visitors)];

  const x = d3
    .scaleLinear()
    .domain(d3.extent(rows, (d) => d.year))
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (d) => d.visitors)])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

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
        .y((d) => y(d.visitors))
    );

  svg
    .append("circle")
    .attr("cx", x(peak.year))
    .attr("cy", y(peak.visitors))
    .attr("r", 5)
    .attr("fill", "#d62728");
  svg
    .append("text")
    .attr("x", x(peak.year) - 10)
    .attr("y", y(peak.visitors))
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("font-size", 12)
    .text(`Peak: ${d3.format(",")(peak.visitors)} in ${peak.year}`);
}
