import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { streamgraphData } from "../../src/data/streamgraphData";
import { Chart, spread, blank, stack, layer, selectAll } from "../../src/lib";
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
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      Chart(seafood)
        .flow(spread({ by: "lake",  dir: "x", spacing: 64 }))
        .mark(blank({ h: "count" }).name("points")),
      Chart(selectAll("points")).mark(area({ opacity: 0.8 })),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};

export const Stacked: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    layer([
      Chart(seafood)
        .flow(
          spread({ by: "lake",  dir: "x", spacing: 64 }),
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

export const Layered: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      Chart(streamgraphData)
        .flow(group({ by: "c" }), spread({ by: "x",  dir: "x", spacing: 50 }))
        .mark(blank({ h: "y", fill: "c" }).name("points")),
      Chart(selectAll("points"))
        .flow(group({ by: "datum.c" }))
        .mark(area({ opacity: 0.7 })),
    ]).render(container, {
      w: 500,
      h: 300,
      axes: true,
    });

    return container;
  }
}
