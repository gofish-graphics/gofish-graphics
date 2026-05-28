import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, spread, rect, stack, derive } from "../../src/lib";
import { normalize } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Mosaic Chart",
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
  render: (args: Args) => {
    const container = initializeContainer();

    const data = [
      { origin: "Europe", cylinders: "4", count: 66 },
      { origin: "Europe", cylinders: "5", count: 3 },
      { origin: "Europe", cylinders: "6", count: 4 },
      { origin: "Japan", cylinders: "3", count: 4 },
      { origin: "Japan", cylinders: "4", count: 69 },
      { origin: "Japan", cylinders: "6", count: 6 },
      { origin: "USA", cylinders: "4", count: 72 },
      { origin: "USA", cylinders: "6", count: 74 },
      { origin: "USA", cylinders: "8", count: 108 },
    ];

    Chart(data)
      .flow(
        spread({ by: "origin",  dir: "x" }),
        derive((d) => normalize(d, "count")),
        stack({ by: "cylinders",  dir: "y" })
      )
      .mark(
        rect({ h: "count", fill: "origin", stroke: "white", strokeWidth: 2 })
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};
