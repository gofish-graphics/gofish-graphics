import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 100, bottom: 40, left: 50 };

  const regions = [...new Set(data.map((d) => d.region))];
  const brands = [...new Set(data.map((d) => d.brand))];
  const units = d3.rollup(
    data,
    (v) => d3.sum(v, (d) => d.units),
    (d) => d.region,
    (d) => d.brand
  );
  const totals = regions.map((r) => d3.sum(units.get(r).values()));

  const x = d3
    .scaleLinear()
    .domain([0, d3.sum(totals)])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, 1])
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(brands);

  // One column per region: [x0, x1) in units, and its brand segments as
  // [y0, y1) shares, stacked bottom to top.
  const cells = [];
  const columns = [];
  let x0 = 0;
  regions.forEach((region, i) => {
    const x1 = x0 + totals[i];
    columns.push({ region, x0, x1 });
    let y0 = 0;
    for (const brand of brands) {
      const share = (units.get(region).get(brand) ?? 0) / totals[i];
      cells.push({ region, brand, x0, x1, y0, y1: y0 + share });
      y0 += share;
    }
    x0 = x1;
  });

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("x", (d) => x(d.x0))
    .attr("width", (d) => x(d.x1) - x(d.x0))
    .attr("y", (d) => y(d.y1))
    .attr("height", (d) => y(d.y0) - y(d.y1))
    .attr("fill", (d) => color(d.brand))
    .attr("stroke", "white");

  svg
    .append("g")
    .attr("font-size", 12)
    .attr("text-anchor", "middle")
    .selectAll("text")
    .data(columns)
    .join("text")
    .attr("x", (d) => (x(d.x0) + x(d.x1)) / 2)
    .attr("y", height - margin.bottom + 18)
    .text((d) => d.region);

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5, "%"));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data(brands)
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
