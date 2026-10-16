import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { streamgraphData } from "../../src/data/streamgraphData";
import { chart, spread, stack } from "../../src/lib";
import { ribbon, group } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Area",
  argTypes: {
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { h: number };

export const Basic: StoryObj<Args> = {
  args: { h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Area Chart",
      description: "Fish catch counts across six lakes drawn as a single smoothed filled area.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood)
      .flow(spread({ by: "lake", dir: "x", spacing: 64 }))
      .mark(ribbon({ h: "count", opacity: 0.8 }))
      .render(container, { h: args.h });

    return container;
  },
};

export const Stacked: StoryObj<Args> = {
  args: { h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Area Chart",
      description: "Fish catch counts by lake split into stacked bands by species, each a colored filled area.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood)
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64 }),
        stack({ by: "species", dir: "y" })
      )
      .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
      .render(container, { h: args.h });

    return container;
  },
};

export const Layered: StoryObj<Args> = {
  args: { h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Layered Area Chart",
      description: "Five overlapping series drawn as translucent filled areas so their changing magnitudes can be compared across a shared x-axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(streamgraphData)
      .flow(spread({ by: "x", dir: "x", spacing: 50 }), group({ by: "c" }))
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.7 }))
      .render(container, { h: args.h });

    return container;
  }
}
