import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect } from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/Negative",
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
      title: "Bar Chart with Negative Values",
      description:
        "A bar chart whose values span positive and negative, with bars extending above and below the zero baseline.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const testData = [
      { category: "A", value: -30 },
      { category: "B", value: 80 },
      { category: "C", value: 45 },
      { category: "D", value: 60 },
      { category: "E", value: 20 },
    ];

    chart(testData, { axes: true })
      .flow(spread({ by: "category",  dir: "x" }))
      .mark(rect({ h: "value" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
