import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, blank, layer, selectAll } from "../../src/lib";
import { area, group } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Ridgeline Chart",
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
  args: { w: 500, h: 300 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Ridgeline Chart",
      description:
        "A ridgeline chart of fish catch by species across six lakes, with each lake's per-species area silhouettes layered and overlapped by a negative vertical offset so the ridges read as a cascade of stacked mountain profiles.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      chart(seafood)
        .flow(
          spread({ by: "lake", dir: "x", spacing: 80 }),
          spread({ by: "species", dir: "y", spacing: -16 })
        )
        .mark(blank({ h: "count", fill: "species" }).name("points")),
      chart(selectAll("points"))
        .flow(group({ by: "species" }))
        .mark(area({ opacity: 0.8, mixBlendMode: "normal" })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};
