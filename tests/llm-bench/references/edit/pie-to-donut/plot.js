import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no arc mark: lay out the slices with d3.pie, and draw them in a
// custom render of a mark whose fill channel goes through Plot's color scale
// (so the legend matches).
export default function render(container, data) {
  const slices = d3
    .pie()
    .sort(null)
    .value((d) => d.amount)(data);
  const arc = d3.arc().innerRadius(75).outerRadius(150);
  container.append(
    Plot.plot({
      width: 480,
      height: 400,
      color: { legend: true },
      marks: [
        Plot.dot(slices, {
          fill: (d) => d.data.category,
          frameAnchor: "middle",
          render: (index, scales, { fill }, { width, height }) =>
            d3
              .create("svg:g")
              .attr("transform", `translate(${width / 2},${height / 2})`)
              .call((g) =>
                g
                  .selectAll("path")
                  .data(index)
                  .join("path")
                  .attr("d", (i) => arc(slices[i]))
                  .attr("fill", (i) => fill[i])
                  .attr("stroke", "white")
              )
              .node(),
        }),
      ],
    })
  );
}
