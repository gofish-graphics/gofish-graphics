import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, clock, rect, spread } from "../../src/lib";

// Accessor functions in size channels (#1080, #937). The Python ports pass
// lambdas, which reach JS as async accessors that call back into Python; the
// render must match these JS accessors exactly.
const meta: Meta = {
  title: "Forward Syntax/Accessor Channels",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** A bar's height from an accessor: the same bars as `h: "count"`. */
export const BarHeight: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: (d: { count: number }) => d.count }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

/** A rose whose wedge radius comes from an accessor nested in `dims`. */
export const RoseRadius: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(seafood, { coord: clock() })
      .flow(spread({ by: "lake", dir: "x", spacing: 0 }))
      .mark(
        rect({
          w: (Math.PI * 2) / 6,
          emX: true,
          fill: "lake",
          dims: { r: { size: (d: { count: number }) => Math.sqrt(d.count) } },
        })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
