import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 400;
  const cell = 9;
  const gap = 2;
  const cols = 5;
  const blockGap = 14;
  const blockW = cols * (cell + gap) - gap;
  const left = 80;
  const baseline = 350; // bottom edge of every block

  const lakes = data.map((d) => d.lake);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(lakes);
  // One entry per square: square i of block k sits in row i / 5 (counted up
  // from the baseline) and column i % 5 (from the left).
  const squares = data.flatMap((d, k) =>
    d3.range(d.count).map((i) => ({ lake: d.lake, k, i }))
  );
  const blockX = (k) => left + k * (blockW + blockGap);

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
    .attr("x", (d) => blockX(d.k) + (d.i % cols) * (cell + gap))
    .attr("y", (d) => baseline - cell - Math.floor(d.i / cols) * (cell + gap))
    .attr("width", cell)
    .attr("height", cell)
    .attr("fill", (d) => color(d.lake));

  svg
    .append("g")
    .selectAll("text")
    .data(lakes)
    .join("text")
    .attr("x", (d, k) => blockX(k) + blockW / 2)
    .attr("y", baseline + 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .text((d) => d);
}
