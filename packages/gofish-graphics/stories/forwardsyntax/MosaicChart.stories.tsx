import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, rect, stack, field } from "../../src/lib";

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
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Mosaic Chart",
      description:
        "A mosaic plot of car counts by region of origin and cylinder count, where column widths show each region's share and stacked segments show the cylinder distribution within it.",
    },
  },
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

    chart(data, { axes: true })
      .flow(
        // Column widths ∝ each region's total (marginal): `size: "count"`
        // sizes each column by its raw Σcount. Stacked segments fill the
        // column, split by cylinder share (conditional): `size:
        // field("count").normalize()` replaces both the segment's raw count
        // AND its w/h — the wrapper's data-driven size claim fills the
        // column height in proportion to each cylinder group's share. No
        // preprocessing.
        stack({ by: "origin", dir: "x", size: "count" }),
        stack({ by: "cylinders", dir: "y", size: field("count").normalize() })
      )
      .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
