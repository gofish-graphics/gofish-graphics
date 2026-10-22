import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, stack, rect, Color } from "../../../src/lib";

// Mirrors: https://vega.github.io/vega-lite/examples/bar_grouped.html

const values = [
  { category: "A", group: "x", value: 0.1 },
  { category: "A", group: "y", value: 0.6 },
  { category: "A", group: "z", value: 0.9 },
  { category: "B", group: "x", value: 0.7 },
  { category: "B", group: "y", value: 0.2 },
  { category: "B", group: "z", value: 1.1 },
  { category: "C", group: "x", value: 0.6 },
  { category: "C", group: "y", value: 0.1 },
  { category: "C", group: "z", value: 0.2 },
];

const meta: Meta = {
  title: "Vega-Lite/Grouped Bar Chart",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  // Vega-Lite's size: a 20 px step per offset bar, three per category over
  // three categories, and a continuous y is 200 px tall.
  args: { w: 3 * 3 * 20, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(values, {
      color: Color.palette("tableau10"),
      w: args.w,
      h: args.h,
    })
      .flow(
        spread({ by: "category",  dir: "x", spacing: 24 }),
        spread({ by: "group",  dir: "x", spacing: 0 })
      )
      .mark(rect({ h: "value", fill: "group" }))
      .render(container);

    return container;
  },
};
