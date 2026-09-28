import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 420;
  const margin = { top: 40, right: 30, bottom: 30, left: 110 };

  const nations = [...new Set(data.map((d) => d.nationality))];
  const genders = [...new Set(data.map((d) => d.gender))];
  const max = d3.max(data, (d) => d.percent);

  const y = d3
    .scaleBand()
    .domain(nations)
    .range([margin.top, height - margin.bottom])
    .padding(0.2);
  // Women to the left of the center line, Men to the right, one scale.
  const x = d3
    .scaleLinear()
    .domain([-max, max])
    .nice()
    .range([margin.left, width - margin.right]);
  const color = d3.scaleOrdinal(["#e15759", "#4e79a7"]).domain(genders);
  const signed = (d) => (d.gender === genders[0] ? -d.percent : d.percent);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(Math.min(0, signed(d))))
    .attr("y", (d) => y(d.nationality))
    .attr("width", (d) => Math.abs(x(signed(d)) - x(0)))
    .attr("height", y.bandwidth())
    .attr("fill", (d) => color(d.gender));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat((v) => Math.abs(v)));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove());

  const legend = svg
    .append("g")
    .attr("transform", `translate(${margin.left},12)`)
    .selectAll("g")
    .data(genders)
    .join("g")
    .attr("transform", (d, i) => `translate(${i * 90},0)`);
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
