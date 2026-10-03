import * as d3 from "d3";

export default function render(container, data) {
  const width = 520;
  const height = 520;
  const inner = 60;
  const outer = 190;

  const step = (2 * Math.PI) / data.length;
  const pad = 0.04;
  const length = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.exports)])
    .range([0, outer - inner]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height]);

  // d3.arc measures angles clockwise from 12 o'clock.
  const arc = d3
    .arc()
    .innerRadius(inner)
    .outerRadius((d) => inner + length(d.exports))
    .startAngle((d, i) => i * step + pad)
    .endAngle((d, i) => (i + 1) * step - pad);
  svg
    .append("g")
    .selectAll("path")
    .data(data)
    .join("path")
    .attr("fill", "#69b3a2")
    .attr("d", (d, i) => arc(d, i));

  // Country names beyond each bar's end, rotated along its angle.
  svg
    .append("g")
    .attr("font-size", 11)
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("transform", (d, i) => {
      const a = ((i + 0.5) * step * 180) / Math.PI;
      const r = inner + length(d.exports) + 6;
      return a < 180
        ? `rotate(${a - 90}) translate(${r},0)`
        : `rotate(${a - 90}) translate(${r},0) rotate(180)`;
    })
    .attr("dy", "0.35em")
    .attr("text-anchor", (d, i) =>
      (i + 0.5) * step < Math.PI ? "start" : "end"
    )
    .text((d) => d.country);
}
