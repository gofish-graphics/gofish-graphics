import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 130, bottom: 30, left: 60 };

  const categories = [...new Set(data.map((d) => d.category))];
  const series = d3
    .stack()
    .keys(categories)
    .value(([, byCategory], key) => byCategory.get(key).sales)(
    d3.index(
      data,
      (d) => d.date,
      (d) => d.category
    )
  );

  const x = d3
    .scaleUtc()
    .domain(d3.extent(data, (d) => new Date(d.date)))
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(series.at(-1), (d) => d[1])])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(categories);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  const area = d3
    .area()
    .x((d) => x(new Date(d.data[0])))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]));
  svg
    .append("g")
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("fill", (s) => color(s.key))
    .attr("d", area);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(d3.utcYear.every(1)));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6, "~s"));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data([...categories].reverse())
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
