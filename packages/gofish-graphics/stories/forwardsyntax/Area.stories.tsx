import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { streamgraphData } from "../../src/data/streamgraphData";
import { chart, spread, blank, stack, layer, selectAll } from "../../src/lib";
import { area, group } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Area",
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

export const Basic: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Area Chart",
      description: "Fish catch counts across six lakes drawn as a single smoothed filled area.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // An area chart has no intrinsic width, so it fills the container: the
    // six lakes are spread to span `args.w` (five gaps between them) instead of
    // a fixed pixel spacing, which would leave the canvas partly empty.
    const lakes = 6;
    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x", spacing: args.w / (lakes - 1) }))
      .mark(blank({ h: "count" }))
      .connect(area({ opacity: 0.8 }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const Stacked: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Area Chart",
      description: "Fish catch counts by lake split into stacked bands by species, each a colored filled area.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      chart(seafood)
        .flow(
          spread({ by: "lake",  dir: "x", spacing: 64 }),
          stack({ by: "species",  dir: "y" })
        )
        .mark(blank({ h: "count", fill: "species" }).name("bars")),
      chart(selectAll("bars"))
        .flow(group({ by: "species" }))
        .mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const Layered: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Layered Area Chart",
      description: "Five overlapping series drawn as translucent filled areas so their changing magnitudes can be compared across a shared x-axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      chart(streamgraphData)
        .flow(spread({ by: "x",  dir: "x", spacing: 50 }), group({ by: "c" }))
        .mark(blank({ h: "y", fill: "c" }).name("points")),
      chart(selectAll("points"))
        .flow(group({ by: "c" }))
        .mark(area({ opacity: 0.7 })),
    ]).render(container, {
      w: 500,
      h: 300,
      axes: true,
    });

    return container;
  }
}
