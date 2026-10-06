// Violin Plot
// Body-mass distributions for three penguin species drawn as violins, where each silhouette's width shows the density of measurements at that value.

import { layer, map, rect, ribbon, spreadX, stackY, v } from "gofish-graphics";
import { density1d } from "fast-kde";
import { groupBy } from "lodash";
import { penguins } from "./dataset";
const container = document.getElementById("app");
spreadX(
  { spacing: 64, sharedScale: true },
  map(groupBy(penguins, "Species"), (d, species) => {
    const density = Array.from(
      density1d(d.map((p) => p["Body Mass (g)"]).filter((w) => w !== null)),
    );
    return layer({}, [
      stackY(
        { alignment: "middle" },
        map(density, (d) =>
          rect({
            y: -d.x / 40,
            w: d.y * 100000,
            h: 0,
            fill: v(species),
          }).name(`${species}-${d.x}`),
        ),
      ),
    ]).relate((names) => [
      ribbon(
        { dir: "y", opacity: 1, mixBlendMode: "normal" },
        map(density, (d) => names[`${species}-${d.x}`]),
      ),
    ]);
  }),
).render(container, {
  axes: true,
});
