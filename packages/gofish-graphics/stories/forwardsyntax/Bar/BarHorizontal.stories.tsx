import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { chart, spread, rect } from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/Horizontal",
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
      title: "Horizontal Bar Chart",
      description:
        "Total fish catch counts across six lakes shown as horizontal bars.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake",  dir: "y" }))
      .mark(rect({ w: "count" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
