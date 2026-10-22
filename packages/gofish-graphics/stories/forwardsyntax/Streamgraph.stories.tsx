import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, stack } from "../../src/lib";
import { ribbon } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Streamgraph",
  argTypes: {
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { h: number };

export const Default: StoryObj<Args> = {
  args: { h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Streamgraph",
      description:
        "A streamgraph of fish catch by species across six lakes, with the stacked bands centered around a wandering baseline so each species reads as a flowing organic layer.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { h: args.h })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }),
        stack({ by: "species", dir: "y" })
      )
      .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
      .render(container);

    return container;
  },
};
