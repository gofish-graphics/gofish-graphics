import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect, field } from "../../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/bar_aggregate_sort_by_encoding.html

const meta: Meta = {
  title: "Vega-Lite/Aggregate Bar chart (Sorted)",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  // Vega-Lite's size: `height: {step: 17}` over the 19 age groups, and a
  // continuous x is 200 px wide.
  args: { w: 200, h: 19 * 17 },
  loaders: [async () => ({ population: await data["population.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const year2000 = (context.loaded.population as any[]).filter(
      (d) => d.year === 2000
    );

    // Order age groups by their total (summed) people, descending.
    chart(year2000, { w: args.w, h: args.h })
      .flow(spread({ by: field("age").sort("people", "desc"),  dir: "y" }))
      .mark(rect({ w: "people" }))
      .render(container);

    return container;
  },
};
