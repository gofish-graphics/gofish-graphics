import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, circle, spread } from "../../src/lib";

// Circles sized by area (#972). The `area` channel sums a group's rows, as a
// size does, and hands the circle the square root of the sum, so each
// circle's area, not its radius, is proportional to the lake's catch. The
// one scale the row is fitted with sizes every circle, on both axes (#1087).
//
// The y axis is off. The circles' diameters are lengths of y in √count, and
// an axis in √count is not one a reader can use: the axis this chart wants
// reads count on a square-root scale, which does not exist yet (#14).
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
    // TODO(#14): a count axis on a square-root scale, then turn y back on.
    chart(seafood, { w: args.w, h: args.h, axes: { x: true, y: false } })
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
