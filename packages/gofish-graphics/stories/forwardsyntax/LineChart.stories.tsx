import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray } from "../../src/data/catch";
import { drivingShifts } from "../../src/data/drivingShifts";
import { chart, line, blank } from "../../src/lib";
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

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(blank())
      .connect(line())
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const GasPrices: StoryObj<Args> = {
  args: { w: 500, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Line Chart",
      description:
        "A line chart tracing the average US price of gasoline year by year from 1956 to 2010, with the line ascending in chronological order to show how prices rose and fell over time.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts, { axes: true })
      .flow(scatter({ by: "year", x: "year", y: "gas" }))
      .mark(blank())
      .connect(line({ stroke: "steelblue", strokeWidth: 2 }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
