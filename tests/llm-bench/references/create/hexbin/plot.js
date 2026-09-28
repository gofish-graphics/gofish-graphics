import * as Plot from "@observablehq/plot";

// Plot's hexbin transform bins in pixels. Its binWidth is the distance
// between neighboring centers, sqrt(3) times the radius.
export default function render(container, data) {
  const radius = 25; // px, center to corner
  container.append(
    Plot.plot({
      width: 600,
      height: 450,
      // A bin's center is up to one radius from its films and its hexagon
      // reaches one more, so this inset keeps the hexagons inside the plot.
      inset: 2 * radius,
      x: { label: "Budget (millions)" },
      y: { label: "Box office (millions)" },
      color: {
        type: "linear",
        scheme: "oranges",
        zero: true,
        legend: true,
        label: "Films",
      },
      marks: [
        Plot.hexagon(
          data,
          Plot.hexbin(
            { fill: "count" },
            {
              x: "budget",
              y: "box_office",
              binWidth: radius * Math.sqrt(3),
              stroke: "white",
              strokeWidth: 0.5,
            }
          )
        ),
      ],
    })
  );
}
