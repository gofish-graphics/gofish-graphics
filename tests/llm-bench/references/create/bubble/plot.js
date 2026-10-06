import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 440,
      x: { label: "GDP per capita (thousand USD)" },
      y: { label: "Life expectancy (years)" },
      r: { range: [0, 30] },
      color: { legend: true },
      marks: [
        Plot.dot(data, {
          x: "gdp_per_capita",
          y: "life_expectancy",
          r: "population",
          fill: "region",
          fillOpacity: 0.6,
        }),
      ],
    })
  );
}
