import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect, scatter, circle } from "../../src/lib";
import { drivingShifts } from "../../src/data/drivingShifts";

const meta: Meta = {
  title: "Forward Syntax V3/Faceted Chart",
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
  args: { w: 1000, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x", spacing: 15 }))
      .mark((data) =>
        chart(data)
          .flow(spread({ by: "species", dir: "x", spacing: 2,  axes: {x: true, y: false} }))
          .mark(rect({ h: "count", w: 20 }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const FacetedScatterDriving: StoryObj<Args> = {
  args: { w: 800, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts, { axes: true })
      .flow(spread({ by: "side", dir: "x", spacing: 50 }))
      .mark((data) =>
        chart(data)
          .flow(scatter({ x: "year", y: "miles", axes: {x: true, y: false} }))
          .mark(circle({ r: 3, fill: "#4682b4" }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const FacetedScatterY: StoryObj<Args> = {
  args: { w: 400, h: 800 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Faceted Scatter Plot",
      description: "Gas prices over the years shown as small-multiple scatter panels stacked vertically, one per side of the road.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts, { axes: true })
      .flow(spread({ by: "side", dir: "y", spacing: 50 }))
      .mark((data) =>
        chart(data)
          .flow(scatter({ x: "year", y: "gas", axes: {x: false, y: true} }))
          .mark(circle({ r: 3, fill: "#e07b39" }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
