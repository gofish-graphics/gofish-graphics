import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { Chart, spread, blank, stack, layer, selectAll } from "../../src/lib";
import { area, group } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Streamgraph",
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

    layer([
      Chart(seafood)
        .flow(
          spread({ by: "lake",  dir: "x", spacing: 64, alignment: "middle" }),
          stack({ by: "species",  dir: "y" })
        )
        .mark(blank({ h: "count", fill: "species" }).name("bars")),
      Chart(selectAll("bars"))
        .flow(group({ by: "datum.species" }))
        .mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};
