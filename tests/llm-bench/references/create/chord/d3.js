import * as d3 from "d3";

export default function render(container, data) {
  const width = 480;
  const height = 480;
  const outer = 190;
  const inner = 170;

  const names = [...new Set(data.flatMap((d) => [d.source, d.target]))];
  const index = new Map(names.map((n, i) => [n, i]));
  // Undirected links: the same count both ways, so each chord's two ends
  // are as wide as the link and each group's angle is its total.
  const matrix = names.map(() => names.map(() => 0));
  for (const d of data) {
    matrix[index.get(d.source)][index.get(d.target)] += d.count;
    matrix[index.get(d.target)][index.get(d.source)] += d.count;
  }
  const chords = d3.chord().padAngle(0.05)(matrix);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(names);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height]);

  const group = svg.append("g").selectAll("g").data(chords.groups).join("g");
  group
    .append("path")
    .attr("fill", (d) => color(names[d.index]))
    .attr("d", d3.arc().innerRadius(inner).outerRadius(outer));
  group
    .append("text")
    .attr("transform", (d) => {
      const a = (d.startAngle + d.endAngle) / 2;
      return `translate(${Math.sin(a) * (outer + 18)},${-Math.cos(a) * (outer + 18)})`;
    })
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .text((d) => names[d.index]);

  svg
    .append("g")
    .attr("fill-opacity", 0.6)
    .selectAll("path")
    .data(chords)
    .join("path")
    .attr("fill", (d) => color(names[d.source.index]))
    .attr("d", d3.ribbon().radius(inner));
}
