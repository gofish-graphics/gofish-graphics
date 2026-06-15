import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { spreadX, For, layer, stackY, rect, connectY, ref, v } from "../../src/lib";
import { groupBy } from "lodash";
import { density1d } from 'fast-kde';

const meta: Meta = {
  title: "Low Level Syntax/Violin Plot",
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Violin Plot",
      description:
        "Body-mass distributions for three penguin species drawn as violins, where each silhouette's width shows the density of measurements at that value.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    spreadX(
      { spacing: 64, sharedScale: true },
      For(groupBy(penguins, "Species"), (d, species) => {
        const density = Array.from(
          density1d(d.map((p) => p["Body Mass (g)"]).filter((w) => w !== null))
        );
        return layer({}, [
          stackY(
            { alignment: "middle" },
            For(density, (d) =>
              rect({ y: d.x / 40, w: d.y * 100000, h: 0, fill: v(species) }).name(
                `${species}-${d.x}`
              )
            )
          ),
          connectY(
            { opacity: 1, mixBlendMode: "normal" },
            For(density, (d) => ref(`${species}-${d.x}`))
          ),
        ]);
      })
    ).render(container, {
      axes: true,
    });
    return container;
  }
}
