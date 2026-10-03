import * as Plot from "@observablehq/plot";

const SPECIES = ["Bass", "Trout", "Catfish", "Perch", "Salmon"];

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      fx: { domain: data.map((d) => d.lake), label: null },
      x: { domain: SPECIES, axis: null },
      color: { domain: SPECIES, legend: true },
      marks: [
        Plot.barY(data, {
          fx: "lake",
          x: "species",
          y: "count",
          fill: "species",
        }),
        Plot.ruleY([0]),
      ],
    })
  );
}
