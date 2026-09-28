import * as Plot from "@observablehq/plot";

// One unit square per fish, in square units: block k starts at x = 6k (5
// squares plus a one-square gap), and fills rows of 5 from the bottom.
// (Plot.waffleY draws each lake as one pattern-filled shape, not as separate
// squares.)
export default function render(container, data) {
  const cells = data.flatMap((d, k) =>
    Array.from({ length: d.count }, (_, i) => ({
      lake: d.lake,
      x: 6 * k + (i % 5),
      y: Math.floor(i / 5),
    }))
  );
  container.append(
    Plot.plot({
      width: 560,
      aspectRatio: 1,
      marginBottom: 20,
      axis: null,
      marks: [
        Plot.rect(cells, {
          x: "x",
          y: "y",
          interval: 1,
          fill: "lake",
          inset: 1,
        }),
        Plot.text(data, {
          x: (d, k) => 6 * k + 2.5,
          y: 0,
          text: "lake",
          lineAnchor: "top",
          dy: 4,
        }),
      ],
    })
  );
}
