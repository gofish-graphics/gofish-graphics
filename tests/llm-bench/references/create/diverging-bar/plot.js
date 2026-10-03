import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 560,
      height: 480,
      marginLeft: 30,
      marginRight: 30,
      y: { domain: data.map((d) => d.sub_category), axis: null },
      x: { grid: true },
      marks: [
        Plot.barX(data, {
          x: "profit_ratio",
          y: "sub_category",
          fill: (d) => (d.profit_ratio < 0 ? "#d62728" : "#4e79a7"),
        }),
        // Names sit on the other side of zero from their bar.
        Plot.text(data, {
          x: 0,
          y: "sub_category",
          text: "sub_category",
          textAnchor: "end",
          dx: -6,
          filter: (d) => d.profit_ratio >= 0,
        }),
        Plot.text(data, {
          x: 0,
          y: "sub_category",
          text: "sub_category",
          textAnchor: "start",
          dx: 6,
          filter: (d) => d.profit_ratio < 0,
        }),
        Plot.ruleX([0]),
      ],
    })
  );
}
