import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 100, bottom: 40, left: 50 };

  const lakes = [...new Set(data.map((d) => d.lake))];
  const species = [...new Set(data.map((d) => d.species))];

  const x0 = d3
    .scaleBand()
    .domain(lakes)
    .range([margin.left, width - margin.right])
    .paddingInner(0.15);
  const x1 = d3
    .scaleBand()
    .domain(species)
    .range([0, x0.bandwidth()])
    .padding(0.05);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.count)])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(species);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("g")
    .data(d3.group(data, (d) => d.lake))
    .join("g")
    .attr("transform", ([lake]) => `translate(${x0(lake)},0)`)
    .selectAll("rect")
    .data(([, rows]) => rows)
    .join("rect")
    .attr("x", (d) => x1(d.species))
    .attr("y", (d) => y(d.count))
    .attr("width", x1.bandwidth())
    .attr("height", (d) => y(0) - y(d.count))
    .attr("fill", (d) => color(d.species));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x0));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data(species)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);
  legend
    .append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", color);
  legend
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .attr("font-size", 12)
    .text((d) => d);
}
