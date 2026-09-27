import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 480;
  const margin = { top: 30, right: 110, bottom: 50, left: 60 };
  const R = 20;

  const lakes = d3.groups(data, (d) => d.lake);
  const species = [...new Set(data.map((d) => d.species))];

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.x))
    .nice()
    .range([margin.left + R, width - margin.right - R]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.y))
    .nice()
    .range([height - margin.bottom - R, margin.top + R]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(species);
  const pie = d3
    .pie()
    .sort(null)
    .value((d) => d.count);
  const arc = d3.arc().innerRadius(0).outerRadius(R);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .call((g) =>
      g
        .append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", 38)
        .attr("fill", "currentColor")
        .text("x")
    );
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("x", -40)
        .attr("y", (margin.top + height - margin.bottom) / 2)
        .attr("fill", "currentColor")
        .text("y")
    );

  svg
    .append("g")
    .selectAll("g")
    .data(lakes)
    .join("g")
    .attr(
      "transform",
      ([, rows]) => `translate(${x(rows[0].x)},${y(rows[0].y)})`
    )
    .selectAll("path")
    .data(([, rows]) => pie(rows))
    .join("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data.species));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`)
    .selectAll("g")
    .data(species)
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
