import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 480;
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };

  const months = [...new Set(data.map((d) => d.month))];
  const byMonth = d3.group(data, (d) => d.month);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.temp_c))
    .range([margin.left, width - margin.right]);
  // Baselines, Jan at the top; the top row's peak needs 2 pitches of room.
  const pitch = (height - margin.top - margin.bottom) / (months.length + 1);
  const base = d3
    .scalePoint()
    .domain(months)
    .range([margin.top + 2 * pitch, height - margin.bottom]);
  // Heights: the tallest peak is twice the spacing between baselines.
  const k = (2 * pitch) / d3.max(data, (d) => d.days);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const area = (month) =>
    d3
      .area()
      .x((d) => x(d.temp_c))
      .y0(base(month))
      .y1((d) => base(month) - k * d.days);

  // Top row first, so each ridge is drawn in front of the one above it.
  svg
    .append("g")
    .selectAll("path")
    .data(months)
    .join("path")
    .attr("d", (m) =>
      area(m)([...byMonth.get(m)].sort((a, b) => a.temp_c - b.temp_c))
    )
    .attr("fill", "steelblue")
    .attr("stroke", "white");

  svg
    .append("g")
    .attr("font-size", 11)
    .attr("text-anchor", "end")
    .selectAll("text")
    .data(months)
    .join("text")
    .attr("x", margin.left - 6)
    .attr("y", (m) => base(m))
    .text((m) => m);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .call((g) =>
      g
        .append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", 34)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("temp_c")
    );
}
