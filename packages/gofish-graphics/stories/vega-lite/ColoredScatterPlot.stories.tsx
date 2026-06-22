import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, layer, scatter, circle } from "../../src/lib";
import data from "vega-datasets";
const meta: Meta = {
  title: "Vega-Lite/Colored Scatter Plot",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 300, h: 300 },
  loaders: [async () => ({ penguins: await data["penguins.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Colored Scatter Plot",
      description: "A scatter plot of penguin flipper length against body mass, with points colored by species to reveal three distinct clusters.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const penguinsRaw = context.loaded.penguins as any[];

    // Vega-Lite spec uses non-zero baselines; GoFish infers domains from data by default.
    // Filter nulls to avoid invalid positions.
    const penguins = penguinsRaw
      .filter(
        (d) =>
          d["Flipper Length (mm)"] != null &&
          d["Body Mass (g)"] != null &&
          d["Species"] != null
      )
      .map((d, i) => ({ ...d, id: i }));

      const speciesList = Array.from(new Set(penguins.map((d) => d["Species"])));
      const bySpecies = (species: string) => penguins.filter((d) => d["Species"] === species);

    layer(
      speciesList.map((species) => () =>
        chart(bySpecies(species))
          .flow(
            scatter({ by: "id", 
              x: "Flipper Length (mm)",
              y: "Body Mass (g)",
            })
          )
          .mark(
            circle({
              r: 4,
              stroke: "Species",
              fill: "Species",
              strokeWidth: 3,
            } as any)
          )
          .resolve()
      ) as any
    ).render(container, { w: args.w, h: args.h, axes: true } as any);
    return container;
  },
};
