import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { nightingale } from "../../src/data/nightingale";
import { Chart, rect, stack, spread, derive } from "../../src/lib";
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
  },
};
export default meta;

type Args = { w: number; h: number };

export const Basic: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { coord: clock() })
      .flow(stack({ by: "species",  dir: "x" }))
      .mark(rect({ w: "count", fill: "species" }))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};

export const Donut: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood, { coord: clock() })
      .flow(stack({ by: "species",  dir: "x", y: 50, h: 50 }))
      .mark(rect({ w: "count", fill: "species" }))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};

export const Rose: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(nightingale, { coord: clock() })
      .flow(
        spread({ by: "Month", dir: "x", spacing: 0 }),
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
        axes: true,
      });

    return container;
  },
};
