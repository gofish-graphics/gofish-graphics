import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, scatter, line } from "../../src/lib";
import data from "vega-datasets";

const meta: Meta = {
  title: "Forward Syntax V3/Slope Chart",
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

// Six site panels, each holding ten short two-point slopes (one per barley
// variety) from the 1931 yield to the 1932 yield. No `by` on the line: the
// default split (issue #752) reads it straight off the flow — the year
// spread is the innermost tier that lays out the travel axis (x), so it
// becomes the path tier, and every OTHER grouping (site, variety) splits.
// That is exactly "one line per site-variety pair, walking from 1931 to
// 1932" with no hand-written composite key.
export const Default: StoryObj<Args> = {
  args: { w: 700, h: 350 },
  tags: ["gallery"],
  loaders: [async () => ({ barley: await data["barley.json"]() })],
  parameters: {
    gallery: {
      title: "Barley slope chart",
      description:
        "Barley yield change from 1931 to 1932 at six field sites, with one colored slope per variety showing which sites gained and which declined.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const barley = context.loaded.barley as any[];

    chart(barley, { axes: true })
      .flow(
        spread({ by: "site", dir: "x", spacing: 110 }),
        spread({ by: "year", dir: "x", spacing: 36 }),
        scatter({ by: "variety", y: "yield" })
      )
      .mark(line({ stroke: "variety", strokeWidth: 2 }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
