import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginLeft: 100,
      y: { label: null },
      marks: [
        Plot.barX(
          data,
          Plot.groupY(
            { x: "sum" },
            { y: "site", x: "yield", fill: "steelblue", sort: { y: "-x" } }
          )
        ),
        Plot.ruleX([0]),
      ],
    })
  );
}
