import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      x: { label: "Miles per gallon" },
      y: { label: "Horsepower" },
      marks: [Plot.dot(data, { x: "mpg", y: "horsepower" })],
    })
  );
}
