import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 300;
  const margin = { top: 20, right: 30, bottom: 30, left: 80 };

  const subs = [...new Set(data.map((d) => d.sub_category))];

  const y = d3
    .scalePoint()
    .domain(subs)
    .range([margin.top, height - margin.bottom])
    .padding(0.5);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.avg_sales)])
    .nice()
    .range([margin.left, width - margin.right]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .attr("stroke", "#e94e25")
    .attr("stroke-width", 1.5)
    .selectAll("line")
    .data(data)
    .join("line")
    .attr("x1", (d) => x(d.avg_sales))
    .attr("x2", (d) => x(d.avg_sales))
    .attr("y1", (d) => y(d.sub_category) - 7.5)
    .attr("y2", (d) => y(d.sub_category) + 7.5);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove());
}
