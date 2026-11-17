import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { chart, field, ribbon, stack, Dist } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Distributions",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const NormalCurve: StoryObj<Args> = {
  args: { w: 500, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();

    const d = Dist.normal({ mean: "mean", sd: "sd" });
    chart([{ mean: 0, sd: 1 }])
      .mark(ribbon({ x: d.domain(), h: d.density(), fill: "#4c78a8" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};

export const StackedSpeciesDensities: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    const mass = field("Body Mass (g)");
    chart(penguins.filter((p) => p["Body Mass (g)"] !== null))
      .flow(stack({ by: "Species", dir: "y" }))
      .mark(ribbon({ x: mass.domain(), h: mass.density(), fill: "Species" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
