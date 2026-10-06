import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no arc mark: the dot mark supplies the x, y and fill channels
// (through Plot's scales and color legend), and a custom render draws one
// d3.pie per lake at its dot's position instead of the dots.
export default function render(container, data) {
  const pie = d3
    .pie()
    .sort(null)
    .value((i) => data[i].count);
  const arc = d3.arc().innerRadius(0).outerRadius(20);
  container.append(
    Plot.plot({
      width: 560,
      height: 480,
      inset: 30,
      color: { legend: true },
      marks: [
        Plot.dot(data, {
          x: "x",
          y: "y",
          fill: "species",
          render: (index, scales, { x: X, y: Y, fill: F }) => {
            const g = d3.create("svg:g");
            for (const I of d3.group(index, (i) => data[i].lake).values())
              g.append("g")
                .attr("transform", `translate(${X[I[0]]},${Y[I[0]]})`)
                .selectAll("path")
                .data(pie(I))
                .join("path")
                .attr("d", arc)
                .attr("fill", (a) => F[a.data])
                .attr("stroke", "white");
            return g.node();
          },
        }),
      ],
    })
  );
}
