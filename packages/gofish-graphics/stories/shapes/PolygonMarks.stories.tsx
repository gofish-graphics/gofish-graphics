import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, gradient, polygon } from "../../src/lib";

const meta: Meta = {
  title: "Shapes/Polygon Marks",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 800, step: 10 } },
    h: { control: { type: "number", min: 100, max: 800, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// A field name as `fill` goes through the chart's color scale, as it does on
// `rect` (#953). The two triangles take the two ends of the gradient, and the
// stroke follows the fill rather than painting the field name as a color.
export const DataDrivenFill: StoryObj<Args> = {
  args: { w: 200, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    const rows = [
      {
        n: 1,
        ring: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      {
        n: 5,
        ring: [
          [2, 0],
          [3, 0],
          [3, 1],
        ],
      },
    ];
    chart(rows, { color: gradient(["#fff5eb", "#7f2704"]) })
      .mark(polygon({ points: "ring", fill: "n" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
