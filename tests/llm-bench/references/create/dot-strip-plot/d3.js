import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 380;
  const margin = { top: 20, right: 120, bottom: 30, left: 80 };

  const months = [...new Set(data.map((d) => d.month))];
  const subs = [...new Set(data.map((d) => d.sub_category))];

  const y = d3
    .scalePoint()
    .domain(months)
    .range([margin.top, height - margin.bottom])
    .padding(0.5);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.sales)])
    .nice()
    .range([margin.left, width - margin.right]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(subs);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("stroke", "#ddd")
    .selectAll("line")
    .data(months)
    .join("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d));

  svg
    .append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(d.sales))
    .attr("cy", (d) => y(d.month))
    .attr("r", 6)
    .attr("fill", (d) => color(d.sub_category))
    .attr("fill-opacity", 0.85);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove());

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`)
    .selectAll("g")
    .data(subs)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);
  legend
    .append("circle")
    .attr("cx", 6)
    .attr("cy", 6)
    .attr("r", 6)
    .attr("fill", color);
  legend
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .attr("font-size", 12)
    .text((d) => d);
}
