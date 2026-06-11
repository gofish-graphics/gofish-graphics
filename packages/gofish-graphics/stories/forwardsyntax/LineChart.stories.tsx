import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray } from "../../src/data/catch";
import { Chart, layer, selectAll, line, blank } from "../../src/lib";
import { scatter } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Line Chart",
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

    layer([
      Chart(catchLocationsArray)
        .flow(scatter({ by: "lake",  x: "x", y: "y" }))
        .mark(blank().name("points")),
      Chart(selectAll("points")).mark(line()),
    ]).render(container, {
      w: args.w,
      h: args.h,
      axes: true,
    });

    return container;
  },
};
