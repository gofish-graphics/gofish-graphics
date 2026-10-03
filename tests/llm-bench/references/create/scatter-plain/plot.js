import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { label: "Horsepower" },
      y: { label: "Miles per gallon" },
      marks: [Plot.dot(data, { x: "horsepower", y: "mpg" })],
    })
  );
}
