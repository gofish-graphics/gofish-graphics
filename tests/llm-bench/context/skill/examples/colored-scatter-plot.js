// Colored Scatter Plot
// A scatter plot of penguin flipper length against body mass, with points colored by species to reveal three distinct clusters.

import { chart, circle, layer, scatter } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { penguins: await data["penguins.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const penguinsRaw = context.loaded.penguins;
  // Vega-Lite spec uses non-zero baselines; GoFish infers domains from data by default.
  // Filter nulls to avoid invalid positions.
  const penguins = penguinsRaw
    .filter(
      (d) =>
        d["Flipper Length (mm)"] != null &&
        d["Body Mass (g)"] != null &&
        d["Species"] != null,
    )
    .map((d, i) => ({ ...d, id: i }));
  const speciesList = Array.from(new Set(penguins.map((d) => d["Species"])));
  const bySpecies = (species) =>
    penguins.filter((d) => d["Species"] === species);
  layer(
    speciesList.map(
      (species) => () =>
        chart(bySpecies(species))
          .flow(
            scatter({ by: "id", x: "Flipper Length (mm)", y: "Body Mass (g)" }),
          )
          .mark(
            circle({
              r: 4,
              stroke: "Species",
              fill: "Species",
              strokeWidth: 3,
            }),
          )
          .resolve(),
    ),
  ).render(container, { w: 300, h: 300, axes: true });
})();
