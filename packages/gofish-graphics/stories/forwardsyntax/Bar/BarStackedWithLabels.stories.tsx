import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { chart, spread, rect, stack } from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/Stacked With Labels",
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
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Bar Chart with Labels",
      description:
        "A stacked bar chart of fish catch counts per lake, with each species segment labeled in place.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { axes: true })
      .flow(
        spread({ by: "lake",  dir: "x" }), //
        stack({ by: "species",  dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species", label: true }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
