import * as d3 from "d3";

export default function render(container, data) {
  const width = 720;
  const height = 420;
  const margin = { top: 20, right: 90, bottom: 40, left: 230 };

  const ages = [...new Set(data.map((d) => d.age_range))];
  const answers = [...new Set(data.map((d) => d.savings))];

  const x = d3
    .scaleBand()
    .domain(ages)
    .range([margin.left, width - margin.right])
    .padding(0.04);
  const y = d3
    .scaleBand()
    .domain(answers)
    .range([margin.top, height - margin.bottom])
    .padding(0.04);
  const color = d3
    .scaleSequential(d3.interpolateBlues)
    .domain(d3.extent(data, (d) => d.response_rate));

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.age_range))
    .attr("y", (d) => y(d.savings))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (d) => color(d.response_rate));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickSize(0))
    .call((g) => g.select(".domain").remove());
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove());

  // Color bar: a column of small swatches from the lowest rate to the
  // highest, with the ends labeled.
  const [lo, hi] = color.domain();
  const steps = d3.range(10).map((i) => lo + ((hi - lo) * i) / 9);
  const bar = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 20},${margin.top})`);
  bar
    .selectAll("rect")
    .data(steps)
    .join("rect")
    .attr("x", 0)
    .attr("y", (d, i) => (9 - i) * 14)
    .attr("width", 14)
    .attr("height", 14)
    .attr("fill", (d) => color(d));
  bar
    .append("text")
    .attr("x", 20)
    .attr("y", 10)
    .attr("font-size", 11)
    .text(`${hi}%`);
  bar
    .append("text")
    .attr("x", 20)
    .attr("y", 136)
    .attr("font-size", 11)
    .text(`${lo}%`);
}
