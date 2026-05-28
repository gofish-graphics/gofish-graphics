import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { Chart, spread, rect } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Faceted Chart",
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
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood)
      .flow(spread({ by: "lake", dir: "x", spacing: 48 }))
      .mark((data) =>
        Chart(data)
          .flow(spread({ by: "species", dir: "x" }))
          .mark(rect({ h: "count", w: 20 }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};
