import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, stack, rect, Color } from "../../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/stacked_bar_h.html

const meta: Meta = {
  title: "Vega-Lite/Horizontal Stacked Bar Chart",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  // Vega-Lite's size: a 20 px step per variety (10 of them), and a
  // continuous x is 300 px wide, Vega-Lite's default (its compiled
  // stacked_bar_h plot is 300 × 200).
  args: { w: 300, h: 10 * 20 },
  loaders: [async () => ({ barley: await data["barley.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Horizontal Stacked Bar Chart",
      description: "A horizontal stacked bar chart of barley yield by variety, with each bar segmented and colored by the six experimental field sites.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    chart(context.loaded.barley as any[], {
      color: Color.palette("tableau10"),
      w: args.w,
      h: args.h,
    })
      .flow(spread({ by: "variety",  dir: "y" }), stack({ by: "site",  dir: "x" }))
      .mark(rect({ w: "yield", fill: "site" }))
      .render(container);

    return container;
  },
};
