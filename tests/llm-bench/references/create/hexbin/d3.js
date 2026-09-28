import * as d3 from "d3";

export default function render(container, data) {
  const width = 600;
  const height = 450;
  const margin = { top: 20, right: 90, bottom: 40, left: 60 };
  const sx = 100; // budget between neighboring centers in a row
  const sy = 1000; // box office between rows of the same lattice

  // Nearest center of the two offset lattices, in the scaled distance.
  const bins = new Map();
  for (const d of data) {
    const a = [
      Math.round(d.budget / sx) * sx,
      Math.round(d.box_office / sy) * sy,
    ];
    const b = [
      (Math.round(d.budget / sx - 0.5) + 0.5) * sx,
      (Math.round(d.box_office / sy - 0.5) + 0.5) * sy,
    ];
    const dist = ([cx, cy]) =>
      ((d.budget - cx) / sx) ** 2 + 3 * ((d.box_office - cy) / sy) ** 2;
    const [cx, cy] = dist(a) <= dist(b) ? a : b;
    const key = `${cx},${cy}`;
    if (!bins.has(key)) bins.set(key, { cx, cy, count: 0 });
    bins.get(key).count++;
  }
  const cells = [...bins.values()];

  const x = d3
    .scaleLinear()
    .domain([-50, 450])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([1000, 4000])
    .range([height - margin.bottom, margin.top]);
  const maxCount = d3.max(cells, (d) => d.count);
  const color = d3.scaleSequential(d3.interpolateOranges).domain([0, maxCount]);

  const corners = ({ cx, cy }) =>
    [
      [cx, cy + sy / 3],
      [cx + sx / 2, cy + sy / 6],
      [cx + sx / 2, cy - sy / 6],
      [cx, cy - sy / 3],
      [cx - sx / 2, cy - sy / 6],
      [cx - sx / 2, cy + sy / 6],
    ].map(([px, py]) => [x(px), y(py)]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("path")
    .data(cells)
    .join("path")
    .attr("d", (d) => `M${corners(d).join("L")}Z`)
    .attr("fill", (d) => color(d.count))
    .attr("stroke", "white")
    .attr("stroke-width", 0.5);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .call((g) =>
      g
        .append("text")
        .attr("x", width - margin.right)
        .attr("y", 32)
        .attr("fill", "currentColor")
        .attr("text-anchor", "end")
        .text("Budget (millions)")
    );
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("x", -margin.left + 4)
        .attr("y", margin.top - 8)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .text("Box office (millions)")
    );

  // Legend: one swatch per count.
  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`);
  legend.append("text").attr("y", 0).attr("font-size", 11).text("Films");
  const counts = d3.range(1, maxCount + 1);
  const row = legend
    .selectAll("g")
    .data(counts)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${10 + i * 18})`);
  row
    .append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", (d) => color(d));
  row
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .attr("font-size", 11)
    .text((d) => d);
}
