import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marks: [
        Plot.rectY(
          data,
          Plot.binX({ y: "count" }, { x: "flipper_length_mm", interval: 10 })
        ),
        Plot.ruleY([0]),
      ],
    })
  );
}
