import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { label: "Fuel economy (mpg)" },
      y: { label: "Engine power (hp)" },
      marks: [
        Plot.dot(data, {
          x: "mpg",
          y: "horsepower",
          stroke: (d) => (d.mpg >= 30 ? "#f58518" : "currentColor"),
        }),
      ],
    })
  );
}
