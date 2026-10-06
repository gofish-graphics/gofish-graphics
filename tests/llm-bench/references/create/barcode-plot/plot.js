import * as Plot from "@observablehq/plot";

// Ticks span their row's band less the insets: with four 62 px bands, an
// inset of 24 px at each end leaves ticks about 15 px tall.
export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 300,
      marginLeft: 80,
      y: {
        domain: [...new Set(data.map((d) => d.sub_category))],
        padding: 0,
        label: null,
      },
      x: { grid: true },
      marks: [
        Plot.tickX(data, {
          x: "avg_sales",
          y: "sub_category",
          stroke: "#e94e25",
          strokeWidth: 1.5,
          insetTop: 24,
          insetBottom: 24,
        }),
      ],
    })
  );
}
