import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 110, bottom: 40, left: 90 };

  const questions = [...new Set(data.map((d) => d.question))];
  const answers = [...new Set(data.map((d) => d.answer))];

  const y0 = d3
    .scaleBand()
    .domain(questions)
    .range([margin.top, height - margin.bottom])
    .paddingInner(0.15);
  const y1 = d3
    .scaleBand()
    .domain(answers)
    .range([0, y0.bandwidth()])
    .padding(0.05);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.count)])
    .nice()
    .range([margin.left, width - margin.right]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(answers);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("g")
    .data(d3.group(data, (d) => d.question))
    .join("g")
    .attr("transform", ([question]) => `translate(0,${y0(question)})`)
    .selectAll("rect")
    .data(([, rows]) => rows)
    .join("rect")
    .attr("x", x(0))
    .attr("y", (d) => y1(d.answer))
    .attr("width", (d) => x(d.count) - x(0))
    .attr("height", y1.bandwidth())
    .attr("fill", (d) => color(d.answer));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y0));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data(answers)
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
