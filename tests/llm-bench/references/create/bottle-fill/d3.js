import * as d3 from "d3";

export default function render(container, data) {
  const width = 560;
  const height = 360;
  const bottom = 300; // the shared baseline
  const H = 200; // bottle height: 150 body + 50 neck

  // The outline, relative to the bottle's bottom-left corner (y down).
  const outline =
    d3.line()([
      [0, 0],
      [60, 0],
      [60, -150],
      [40, -150],
      [40, -200],
      [20, -200],
      [20, -150],
      [0, -150],
    ]) + "Z";

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.wine))
    .range([40, width - 40])
    .paddingInner(0.4);
  const level = d3.scaleLinear().domain([0, 100]).range([0, H]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const bottles = svg
    .selectAll("g")
    .data(data)
    .join("g")
    .attr(
      "transform",
      (d) => `translate(${x(d.wine) + x.bandwidth() / 2 - 30},${bottom})`
    );

  // The liquid: a rect from the bottom up to the level, clipped to the
  // bottle's outline.
  bottles
    .append("clipPath")
    .attr("id", (d, i) => `bottle-${i}`)
    .append("path")
    .attr("d", outline);
  bottles
    .append("rect")
    .attr("x", 0)
    .attr("width", 60)
    .attr("y", (d) => -level(d.fill_pct))
    .attr("height", (d) => level(d.fill_pct))
    .attr("fill", "#4caf50")
    .attr("clip-path", (d, i) => `url(#bottle-${i})`);
  bottles
    .append("path")
    .attr("d", outline)
    .attr("fill", "none")
    .attr("stroke", "#444")
    .attr("stroke-width", 2);

  bottles
    .append("text")
    .attr("x", 30)
    .attr("y", -H - 8)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .text((d) => `${d.fill_pct}%`);
  bottles
    .append("text")
    .attr("x", 30)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .text((d) => d.wine);
}
