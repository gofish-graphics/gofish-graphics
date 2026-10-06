import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no polar coordinates or arc mark: draw each bar as a d3.arc path
// in a custom render of a mark, and place the names with Plot.text on
// identity scales centered on the plot.
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
  // d3.arc measures angles clockwise from 12 o'clock.
  const arc = d3
    .arc()
    .innerRadius(inner)
    .outerRadius((d) => inner + length(d.exports))
    .startAngle((d, i) => i * step + pad)
    .endAngle((d, i) => (i + 1) * step - pad);
  const labels = data.map((d, i) => {
    const a = (i + 0.5) * step;
    const r = inner + length(d.exports) + 6;
    const deg = (a * 180) / Math.PI;
    const right = a < Math.PI;
    return {
      country: d.country,
      x: width / 2 + r * Math.sin(a),
      y: height / 2 - r * Math.cos(a),
      rotate: right ? deg - 90 : deg + 90,
      right,
    };
  });
  container.append(
    Plot.plot({
      width,
      height,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      marks: [
        Plot.dot(data, {
          frameAnchor: "middle",
          render: (index) =>
            d3
              .create("svg:g")
              .attr("transform", `translate(${width / 2},${height / 2})`)
              .call((g) =>
                g
                  .selectAll("path")
                  .data(index)
                  .join("path")
                  .attr("d", (i) => arc(data[i], i))
                  .attr("fill", "#69b3a2")
              )
              .node(),
        }),
        Plot.text(labels, {
          filter: "right",
          x: "x",
          y: "y",
          rotate: "rotate",
          text: "country",
          textAnchor: "start",
        }),
        Plot.text(labels, {
          filter: (d) => !d.right,
          x: "x",
          y: "y",
          rotate: "rotate",
          text: "country",
          textAnchor: "end",
        }),
      ],
    })
  );
}
