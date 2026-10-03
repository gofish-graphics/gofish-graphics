import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 30, left: 60 };

  const rows = data.map((d) => ({ date: new Date(d.date), value: d.balance }));

  const x = d3
    .scaleUtc()
    .domain(d3.extent(rows, (d) => d.date))
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent([0, ...rows.map((d) => d.value)]))
    .nice()
    .range([height - margin.bottom, margin.top]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  // One area from zero to the line, drawn twice: clipped above zero in one
  // color and below zero in another, so the color changes where the line
  // crosses zero.
  const defs = svg.append("defs");
  defs
    .append("clipPath")
    .attr("id", "above-zero")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", y(0));
  defs
    .append("clipPath")
    .attr("id", "below-zero")
    .append("rect")
    .attr("x", 0)
    .attr("y", y(0))
    .attr("width", width)
    .attr("height", height - y(0));

  const area = d3
    .area()
    .x((d) => x(d.date))
    .y0(y(0))
    .y1((d) => y(d.value));
  svg
    .append("path")
    .datum(rows)
    .attr("clip-path", "url(#above-zero)")
    .attr("fill", "#2a9d8f")
    .attr("d", area);
  svg
    .append("path")
    .datum(rows)
    .attr("clip-path", "url(#below-zero)")
    .attr("fill", "#e76f51")
    .attr("d", area);

  svg
    .append("path")
    .datum(rows)
    .attr("fill", "none")
    .attr("stroke", "#222")
    .attr("stroke-width", 1.5)
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.date))
        .y((d) => y(d.value))
    );

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}
