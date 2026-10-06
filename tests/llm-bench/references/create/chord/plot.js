import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no chord layout: lay it out with d3.chord, draw the ring
// segments and ribbons as d3.arc and d3.ribbon paths in custom renders of
// marks whose fills go through Plot's color scale, and place the names with
// Plot.text on identity scales.
export default function render(container, data) {
  const width = 480;
  const height = 480;
  const outer = 190;
  const inner = 170;

  const names = [...new Set(data.flatMap((d) => [d.source, d.target]))];
  const index = new Map(names.map((n, i) => [n, i]));
  // Undirected links: the same count both ways, so each chord's two ends
  // are as wide as the link and each group's angle is its total.
  const matrix = names.map(() => names.map(() => 0));
  for (const d of data) {
    matrix[index.get(d.source)][index.get(d.target)] += d.count;
    matrix[index.get(d.target)][index.get(d.source)] += d.count;
  }
  const chords = d3.chord().padAngle(0.05)(matrix);
  const groupArc = d3.arc().innerRadius(inner).outerRadius(outer);
  const ribbon = d3.ribbon().radius(inner);

  // A mark that draws one path per datum, centered on the plot.
  const paths = (items, path, options) =>
    Plot.dot(items, {
      ...options,
      frameAnchor: "middle",
      render: (index, scales, { fill }) =>
        d3
          .create("svg:g")
          .attr("transform", `translate(${width / 2},${height / 2})`)
          .attr("fill-opacity", options.fillOpacity ?? 1)
          .call((g) =>
            g
              .selectAll("path")
              .data(index)
              .join("path")
              .attr("d", (i) => path(items[i]))
              .attr("fill", (i) => fill[i])
          )
          .node(),
    });

  container.append(
    Plot.plot({
      width,
      height,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      color: { domain: names, scheme: "tableau10" },
      marks: [
        paths(chords.groups, groupArc, { fill: (d) => names[d.index] }),
        paths(chords, ribbon, {
          fill: (d) => names[d.source.index],
          fillOpacity: 0.6,
        }),
        Plot.text(chords.groups, {
          x: (d) =>
            width / 2 +
            Math.sin((d.startAngle + d.endAngle) / 2) * (outer + 18),
          y: (d) =>
            height / 2 -
            Math.cos((d.startAngle + d.endAngle) / 2) * (outer + 18),
          text: (d) => names[d.index],
          fontSize: 13,
        }),
      ],
    })
  );
}
