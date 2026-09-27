import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 100, bottom: 40, left: 50 };

  const lakes = [...new Set(data.map((d) => d.lake))];
  const species = [...new Set(data.map((d) => d.species))];

  const series = d3
    .stack()
    .keys(species)
    .value(([, bySpecies], key) => bySpecies.get(key)?.count ?? 0)(
    d3.index(
      data,
      (d) => d.lake,
      (d) => d.species
    )
  );

  const x = d3
    .scaleBand()
    .domain(lakes)
    .range([margin.left, width - margin.right])
    .paddingInner(0.15);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1]))])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(species);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("g")
    .data(series)
    .join("g")
    .attr("fill", (s) => color(s.key))
    .selectAll("rect")
    .data((s) => s)
    .join("rect")
    .attr("x", (d) => x(d.data[0]))
    .attr("y", (d) => y(d[1]))
    .attr("width", x.bandwidth())
    .attr("height", (d) => y(d[0]) - y(d[1]));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
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
