import * as Plot from "@observablehq/plot";

// One facet row per month. Each row's y range runs from its own bottom (the
// baseline) to one row above its top, so the tallest peak is two rows high.
// (A facet's range is in the coordinates of the plot's top row, so it is
// offset by the top margin.)
export default function render(container, data) {
  const height = 480;
  const marginTop = 50;
  const marginBottom = 30;
  const step = (height - marginTop - marginBottom) / 12;
  container.append(
    Plot.plot({
      width: 560,
      height,
      marginTop,
      marginBottom,
      marginLeft: 50,
      fy: { domain: data.map((d) => d.month), padding: 0, axis: null },
      y: { axis: null, range: [marginTop + step, marginTop - step] },
      marks: [
        Plot.areaY(data, {
          x: "temp_c",
          y: "days",
          fy: "month",
          fill: "steelblue",
          stroke: "white",
        }),
        Plot.text(
          data,
          Plot.selectFirst({
            fy: "month",
            text: "month",
            frameAnchor: "bottom-left",
            textAnchor: "end",
            dx: -6,
          })
        ),
      ],
    })
  );
}
