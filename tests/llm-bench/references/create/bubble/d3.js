import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 440;
  const margin = { top: 20, right: 110, bottom: 50, left: 60 };

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.gdp_per_capita)])
    .nice()
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.life_expectancy))
    .nice()
    .range([height - margin.bottom, margin.top]);
  // Area proportional to population: a sqrt scale from zero.
  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(data, (d) => d.population)])
    .range([0, 30]);
  const color = d3
    .scaleOrdinal(d3.schemeTableau10)
    .domain([...new Set(data.map((d) => d.region))]);

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
        .attr("text-anchor", "middle")
        .text("GDP per capita (thousand USD)")
    );
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height - margin.bottom) / 2)
        .attr("y", -40)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Life expectancy (years)")
    );

  // Largest first, so small circles stay on top.
  svg
    .append("g")
    .attr("fill-opacity", 0.6)
    .selectAll("circle")
    .data([...data].sort((a, b) => b.population - a.population))
    .join("circle")
    .attr("cx", (d) => x(d.gdp_per_capita))
    .attr("cy", (d) => y(d.life_expectancy))
    .attr("r", (d) => r(d.population))
    .attr("fill", (d) => color(d.region));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`)
    .selectAll("g")
    .data(color.domain())
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
