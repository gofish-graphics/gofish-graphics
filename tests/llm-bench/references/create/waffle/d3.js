import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 400;
  const cell = 30;
  const gap = 3;
  const left = 20;
  const top = 30;

  const sources = data.map((d) => d.source);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(sources);
  // One entry per square, in data order; square i sits at row i / 10,
  // column i % 10, so the grid fills row by row from the top-left.
  const squares = data.flatMap((d) => d3.range(d.percent).map(() => d.source));

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("rect")
    .data(squares)
    .join("rect")
    .attr("x", (d, i) => left + (i % 10) * (cell + gap))
    .attr("y", (d, i) => top + Math.floor(i / 10) * (cell + gap))
    .attr("width", cell)
    .attr("height", cell)
    .attr("fill", (d) => color(d));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${left + 10 * (cell + gap) + 20},${top})`)
    .selectAll("g")
    .data(sources)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 22})`);
  legend
    .append("rect")
    .attr("width", 14)
    .attr("height", 14)
    .attr("fill", color);
  legend
    .append("text")
    .attr("x", 20)
    .attr("y", 11)
    .attr("font-size", 12)
    .text((d) => d);
}
