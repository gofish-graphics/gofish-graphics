import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 360;
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };

  // Each bar's start and end on the value axis, and its kind.
  let total = 0;
  const bars = data.map((d, i) => {
    const start = i === 0 ? 0 : total;
    total += d.amount;
    return {
      label: d.label,
      start,
      end: total,
      kind: i === 0 ? "total" : d.amount >= 0 ? "up" : "down",
    };
  });
  bars.push({ label: "End", start: 0, end: total, kind: "total" });

  const x = d3
    .scaleBand()
    .domain(bars.map((d) => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.25);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bars, (d) => Math.max(d.start, d.end))])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = { total: "#115DAA", up: "#59a14f", down: "#e15759" };

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("rect")
    .data(bars)
    .join("rect")
    .attr("x", (d) => x(d.label))
    .attr("y", (d) => y(Math.max(d.start, d.end)))
    .attr("width", x.bandwidth())
    .attr("height", (d) => Math.abs(y(d.start) - y(d.end)))
    .attr("fill", (d) => color[d.kind]);

  // Connectors from each bar's end to the next bar.
  svg
    .append("g")
    .attr("stroke", "#888")
    .attr("stroke-dasharray", "2,2")
    .selectAll("line")
    .data(d3.pairs(bars))
    .join("line")
    .attr("x1", ([a]) => x(a.label) + x.bandwidth())
    .attr("x2", ([, b]) => x(b.label))
    .attr("y1", ([a]) => y(a.end))
    .attr("y2", ([a]) => y(a.end));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
}
