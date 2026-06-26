import { penguins } from "../data/penguins";
import { frame, For, groupBy, spreadX, v, spreadY, area, ref, stackY } from "../lib";
import { rect } from "../lib";
import _ from "lodash";
import { density1d } from "fast-kde";

export const testViolinPlot = () => {
  return spreadX(
    { spacing: 64, sharedScale: true },
    For(groupBy(penguins, "Species"), (d, species) => {
      const density = Array.from(density1d(d.map((p) => p["Body Mass (g)"]).filter((w) => w !== null))) as {
        x: number;
        y: number;
      }[];
      return frame({}, [
        stackY(
          {  },
          For(density, (d) => rect({ y: d.x / 40, w: d.y * 100000, h: 0, fill: v(species) }).name(`${species}-${d.x}`))
        ),
        area(
          { dir: "y", opacity: 1, mixBlendMode: "normal" },
          For(density, (d) => ref(`${species}-${d.x}`))
        ),
      ]);
    })
  );
};
