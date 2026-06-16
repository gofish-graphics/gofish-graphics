import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import {
  Chart,
  scatter,
  stack,
  layer,
  rect,
  petal,
  polar,
  Constraint,
} from "../../src/lib";
import { color } from "../../src/color";
import _ from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Flower Chart",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1400, step: 20 } },
    h: { control: { type: "number", min: 200, max: 800, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// One flower per lake: petals are species (color), petal length encodes the
// species' catch, and the stem height encodes the lake's total catch. Flowers
// are planted in a row by lake location (a 1-D scatter on x).
const scatterData = _(seafood)
  .groupBy("lake")
  .map((lakeData, lake) => ({
    lake,
    x: catchLocations[lake as keyof typeof catchLocations].x,
    collection: lakeData.map((item) => ({
      species: item.species,
      count: item.count,
    })),
  }))
  .value();

// Pixels of stem per unit of total catch — keeps stem heights comparable
// across flowers (a shared linear mapping, the gofish analog of PICCL's
// `stem.mapValue("height", "avg")`).
const STEM_SCALE = 1.5;

export const Default: StoryObj<Args> = {
  args: { w: 1000, h: 500 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Flower Chart",
      description:
        "A distribution rendered as a meadow, where each binned count grows a layered flower of colored petals atop a green stem.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(scatterData, { axes: false })
      // 1-D scatter: position each flower by its lake's x location; all
      // flowers share a common ground line (alignment on the unpositioned y).
      .flow(scatter({ by: "lake", x: "x", alignment: "start" }))
      .mark((data) => {
        const sample = data[0];
        const total = _(sample.collection).sumBy("count");

        return layer([
          rect({
            w: 4,
            h: total * STEM_SCALE,
            fill: color.green[5],
          }).name("stem"),
          // The flower head: petals radiating in polar coordinates, one per
          // species, length encoding catch and color encoding species.
          Chart(sample.collection, { coord: polar() })
            .flow(stack({ by: "species", dir: "x", h: total / 2, alignment: "start" }))
            .mark(petal({ w: "count", fill: "species" }))
            .name("flower"),
        ]).constrain(({ stem, flower }) => [
          // Center the flower head over the stem and snap its center onto the
          // stem's top (PICCL's pointSnap(flower, stem, [.5,.5] -> [.5,1])).
          Constraint.align({ x: "middle" }, [stem, flower]),
          Constraint.align({ y: ["end", "middle"] }, [stem, flower]),
        ]);
      })
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
