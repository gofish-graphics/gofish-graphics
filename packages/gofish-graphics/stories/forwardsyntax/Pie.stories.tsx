import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { nightingale } from "../../src/data/nightingale";
import { chart, rect, stack, spread, derive } from "../../src/lib";
import { clock } from "../../src/ast/coordinateTransforms/clock";

const meta: Meta = {
  title: "Forward Syntax V3/Pie",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    padding: {
      control: { type: "number", min: 10, max: 150, step: 5 },
    },
  },
};
export default meta;

type Args = { w: number; h: number; padding: number };

export const Basic: StoryObj<Args> = {
  args: { w: 400, h: 400, padding: 80 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Pie Chart",
      description:
        "A pie chart breaking down total fish catch by species, with each wedge's angle proportional to its share of the catch.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { coord: clock(), axes: true, padding: args.padding })
      .flow(stack({ by: "species",  dir: "x" }))
      .mark(rect({ w: "count", fill: "species" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const Donut: StoryObj<Args> = {
  args: { w: 400, h: 400, padding: 60 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Donut Chart",
      description:
        "A donut chart of fish catch by species, where the open center leaves a ring of wedges sized by each species' share of the total.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { coord: clock(), axes: true, padding: args.padding })
      .flow(stack({ by: "species",  dir: "x", y: 50, h: 50 }))
      .mark(rect({ w: "count", fill: "species" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const Rose: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Nightingale Rose Chart",
      description:
        "A recreation of Florence Nightingale's polar-area diagram of Crimean War mortality, with each month's wedge extending by cause of death (disease, wounds, and other).",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(nightingale, { coord: clock(), axes: true })
      .flow(
        spread({ by: "Month", dir: "x", spacing: 0, axes: {x: false, y: true} }),
        stack({ by: "Type", dir: "y" }),
        /* TODO: push this into the h encoding of rect */
        derive((d) => d.map((d) => ({ ...d, Death: Math.sqrt(d.Death) })))
      )
      .mark(
        /* TODO: remove emX wart */
        rect({ w: (Math.PI * 2) / 12, emX: true, h: "Death", fill: "Type" })
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
