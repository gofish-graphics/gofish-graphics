import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 300;
  const margin = { top: 20, right: 110, bottom: 30, left: 20 };
  const r = 6;

  const genres = [...new Set(data.map((d) => d.genre))];
  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.year))
    .nice()
    .range([margin.left + r, width - margin.right - r]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(genres);
  const center = (margin.top + height - margin.bottom) / 2;

  // Dodge: place circles left to right, each at the offset from the center
  // line nearest zero where it overlaps no circle already placed. The
  // candidates are zero and the offsets that rest it against a neighbor.
  const placed = [];
  for (const d of [...data].sort((a, b) => a.year - b.year)) {
    const cx = x(d.year);
    const near = placed.filter((p) => Math.abs(p.cx - cx) < 2 * r);
    const candidates = [0];
    for (const p of near) {
      const dy = Math.sqrt((2 * r) ** 2 - (p.cx - cx) ** 2);
      candidates.push(p.dy + dy, p.dy - dy);
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b));
    const dy = candidates.find((c) =>
      near.every((p) => Math.hypot(p.cx - cx, p.dy - c) >= 2 * r - 1e-6)
    );
    placed.push({ d, cx, dy });
  }

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("circle")
    .data(placed)
    .join("circle")
    .attr("cx", (p) => p.cx)
    .attr("cy", (p) => center + p.dy)
    .attr("r", r)
    .attr("fill", (p) => color(p.d.genre));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`)
    .selectAll("g")
    .data(genres)
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
