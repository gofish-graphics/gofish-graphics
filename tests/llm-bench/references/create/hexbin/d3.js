import * as d3 from "d3";
import { hexbin } from "d3-hexbin";

export default function render(container, data) {
  const width = 600;
  const height = 450;
  const margin = { top: 20, right: 90, bottom: 40, left: 60 };
  const radius = 25; // px, center to corner

  // Ranges inset by one radius, so the hexagons stay inside the plot.
  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.budget))
    .nice()
    .range([margin.left + radius, width - margin.right - radius]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.box_office))
    .nice()
    .range([height - margin.bottom - radius, margin.top + radius]);

  // Bin in pixels over the plot area.
  const hb = hexbin()
    .x((d) => x(d.budget))
    .y((d) => y(d.box_office))
    .radius(radius)
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ]);
  const bins = hb(data);
  const maxCount = d3.max(bins, (b) => b.length);
  const color = d3.scaleSequential(d3.interpolateOranges).domain([0, maxCount]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("path")
    .data(bins)
    .join("path")
    .attr("d", (b) => `M${b.x},${b.y}${hb.hexagon()}`)
    .attr("fill", (b) => color(b.length))
    .attr("stroke", "white")
    .attr("stroke-width", 0.5);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .call((g) =>
      g
        .append("text")
        .attr("x", width - margin.right)
        .attr("y", 32)
        .attr("fill", "currentColor")
        .attr("text-anchor", "end")
        .text("Budget (millions)")
    );
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("x", -margin.left + 4)
        .attr("y", margin.top - 8)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .text("Box office (millions)")
    );

  // Legend: one swatch per count.
  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`);
  legend.append("text").attr("font-size", 11).text("Films");
  const row = legend
    .selectAll("g")
    .data(d3.range(1, maxCount + 1))
    .join("g")
    .attr("transform", (d, i) => `translate(0,${10 + i * 18})`);
  row.append("rect").attr("width", 12).attr("height", 12).attr("fill", color);
  row
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .attr("font-size", 11)
    .text((d) => d);
}
