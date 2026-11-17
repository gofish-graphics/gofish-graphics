import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import {
  chart,
  field,
  ribbon,
  spread,
  stack,
  Baseline,
} from "../../src/lib";

const meta: Meta = {
  title: "Low Level Syntax/Violin Plot",
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 300 },
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

    const mass = field("Body Mass (g)");
    chart(penguins.filter((p) => p["Body Mass (g)"] !== null))
      .flow(spread({ by: "Species", dir: "x", spacing: 64 }))
      .mark(
        stack({ dir: "x", baseline: Baseline.middle() }, [
          ribbon({ y: mass.domain(), w: mass.density(), fill: "Species" }),
        ])
      )
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
