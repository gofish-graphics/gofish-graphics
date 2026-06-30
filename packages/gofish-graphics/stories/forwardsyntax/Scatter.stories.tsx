import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray, seafood } from "../../src/data/catch";
import { drivingShifts } from "../../src/data/drivingShifts";
import { chart, line, rect, stack, join } from "../../src/lib";
import { circle, scatter } from "../../src/lib";
import { clock } from "../../src/ast/coordinateTransforms/clock";

const meta: Meta = {
  title: "Forward Syntax V3/Scatter",
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

export const Basic: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake",  x: "x", y: "y" }))
      .mark(circle({ r: 5 }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const Connected: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Connected Scatter Plot",
      description:
        "A connected scatter plot tracing gas price against miles driven over successive years, with a line threading the points in chronological order to reveal the path through time.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(drivingShifts, { axes: true })
      .flow(scatter({ by: "year", x: "miles", y: "gas" }))
      .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
      .connect(line({ stroke: "black", strokeWidth: 2 }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

export const WithPieGlyphs: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Scatter Plot with Pie Glyphs",
      description:
        "A scatter plot placing each lake at its geographic location and drawing a miniature pie chart of its species composition as the point glyph.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake",  x: "x", y: "y" }))
      .mark((data) =>
        // Each lake glyph inherits its parent partition (the lake's row) and
        // joins in that lake's catch rows, then draws them as a polar pie.
        chart(data, { coord: clock() })
          .flow(
            join(seafood, { on: "lake" }),
            stack({ by: "species",  dir: "x", /* h: "count" */ h: 20 })
          )
          .mark(rect({ w: "count", fill: "species" }))
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
