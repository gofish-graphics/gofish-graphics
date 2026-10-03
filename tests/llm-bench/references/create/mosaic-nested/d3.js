import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 440;
  const margin = { top: 20, right: 90, bottom: 20, left: 70 };

  const classes = [...new Set(data.map((d) => d.class))];
  const sexes = [...new Set(data.map((d) => d.sex))];
  const outcomes = [...new Set(data.map((d) => d.survived))];
  const sum = (rows) => d3.sum(rows, (d) => d.count);

  const x = d3
    .scaleLinear()
    .domain([0, 1])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, 1])
    .range([height - margin.bottom, margin.top]);
  const color = d3
    .scaleOrdinal()
    .domain(outcomes)
    .range(["#4e79a7", "#bab0ac"]);

  // Split the unit square: class bands bottom to top, then sex left to
  // right within a band, then survived bottom to top within that.
  const cells = [];
  const bands = [];
  let y0 = 0;
  for (const c of classes) {
    const inClass = data.filter((d) => d.class === c);
    const y1 = y0 + sum(inClass) / sum(data);
    bands.push({ c, y0, y1 });
    let x0 = 0;
    for (const s of sexes) {
      const inSex = inClass.filter((d) => d.sex === s);
      const x1 = x0 + sum(inSex) / sum(inClass);
      let v0 = y0;
      for (const o of outcomes) {
        const share = sum(inSex.filter((d) => d.survived === o)) / sum(inSex);
        const v1 = v0 + share * (y1 - y0);
        cells.push({ o, x0, x1, y0: v0, y1: v1 });
        v0 = v1;
      }
      x0 = x1;
    }
    y0 = y1;
  }

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  svg
    .append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("x", (d) => x(d.x0))
    .attr("width", (d) => x(d.x1) - x(d.x0))
    .attr("y", (d) => y(d.y1))
    .attr("height", (d) => y(d.y0) - y(d.y1))
    .attr("fill", (d) => color(d.o))
    .attr("stroke", "white");

  svg
    .append("g")
    .attr("font-size", 12)
    .attr("text-anchor", "end")
    .selectAll("text")
    .data(bands)
    .join("text")
    .attr("x", margin.left - 8)
    .attr("y", (d) => y((d.y0 + d.y1) / 2))
    .attr("dy", "0.35em")
    .text((d) => d.c);

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data(outcomes)
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
