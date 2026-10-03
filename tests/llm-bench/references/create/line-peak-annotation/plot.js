import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  const xy = { x: "year", y: "visitors" };
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { tickFormat: "d" },
      marks: [
        Plot.line(data, xy),
        Plot.dot(data, Plot.selectMaxY({ ...xy, r: 5, fill: "currentColor" })),
        Plot.text(
          data,
          Plot.selectMaxY({
            ...xy,
            text: (d) =>
              `Peak: ${d.visitors.toLocaleString("en-US")} in ${d.year}`,
            dy: -12,
          })
        ),
      ],
    })
  );
}
