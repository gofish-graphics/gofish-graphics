import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { Chart, rect } from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/Stacked Fluent",
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

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood)
      .facet({ by: "lake", dir: "x" })
      .stack({ by: "species", dir: "y" })
      .mark(rect({ h: "count", fill: "species" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
