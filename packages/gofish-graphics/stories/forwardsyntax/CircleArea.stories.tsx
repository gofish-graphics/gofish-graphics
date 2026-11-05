import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, circle, spread } from "../../src/lib";

// Circles sized by area (#972). The `area` channel sums a group's rows, as a
// size does, and hands the circle the square root of the sum, so each
// circle's area, not its radius, is proportional to the lake's catch. The
// one scale the row is fitted with sizes every circle, on both axes (#1087),
// so the value axis reads the circles' own scale.
const meta: Meta = {
  title: "Forward Syntax/Circle Area",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** One circle per lake, its area proportional to the lake's catch. */
export const ByArea: StoryObj<Args> = {
  args: { w: 500, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(seafood, { w: args.w, h: args.h })
      .flow(spread({ by: "lake", dir: "x", spacing: 8 }))
      .mark(circle({ area: "count", fill: "lake" }))
      .render(container);
    return container;
  },
};

/** The same circles by radius, for comparison: here the radius is
 *  proportional to the catch, so the area grows with its square. */
export const ByRadius: StoryObj<Args> = {
  args: { w: 500, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(seafood, { w: args.w, h: args.h })
      .flow(spread({ by: "lake", dir: "x", spacing: 8 }))
      .mark(circle({ r: "count", fill: "lake" }))
      .render(container);
    return container;
  },
};
