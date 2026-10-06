import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 100, bottom: 40, left: 50 };

  const countries = d3.group(data, (d) => d.country);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.year))
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.life_expect))
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3
    .scaleOrdinal(d3.schemeTableau10)
    .domain([...countries.keys()]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.life_expect));

  svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .selectAll("path")
    .data(countries)
    .join("path")
    .attr("stroke", ([country]) => color(country))
    .attr("d", ([, rows]) => line([...rows].sort((a, b) => a.year - b.year)));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data(color.domain())
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);
  legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 16)
    .attr("y1", 6)
    .attr("y2", 6)
    .attr("stroke", color)
    .attr("stroke-width", 2);
  legend
    .append("text")
    .attr("x", 22)
    .attr("y", 10)
    .attr("font-size", 12)
    .text((d) => d);
}
