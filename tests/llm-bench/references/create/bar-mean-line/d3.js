import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.month))
    .range([margin.left, width - margin.right])
    .padding(0.2);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.rain_mm)])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const mean = d3.mean(data, (d) => d.rain_mm);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  svg
    .append("g")
    .attr("fill", "steelblue")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.month))
    .attr("y", (d) => y(d.rain_mm))
    .attr("width", x.bandwidth())
    .attr("height", (d) => y(0) - y(d.rain_mm));

  svg
    .append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", y(mean))
    .attr("y2", y(mean))
    .attr("stroke", "#333")
    .attr("stroke-dasharray", "6 4");
  svg
    .append("text")
    .attr("x", width - margin.right)
    .attr("y", y(mean) - 6)
    .attr("text-anchor", "end")
    .attr("font-size", 12)
    .text(`Mean = ${d3.format(".1f")(mean)}`);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}
