import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Chart, spread, stack, rect, palette } from "../../../src/lib";

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
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(values, { color: palette("tableau10") })
      .flow(
        spread({ by: "category",  dir: "x", spacing: 24 }),
        spread({ by: "group",  dir: "x", spacing: 0 })
      )
      .mark(rect({ h: "value", fill: "group" }))
      .render(container, { h: args.h, axes: true } as any);

    return container;
  },
};
