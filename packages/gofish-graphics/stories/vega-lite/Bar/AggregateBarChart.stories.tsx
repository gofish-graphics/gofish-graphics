import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Chart, spread, rect, derive } from "../../../src/lib";
import { groupBy, sumBy } from "lodash";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/bar_aggregate.html

const meta: Meta = {
  title: "Vega-Lite/Aggregate Bar Chart",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  loaders: [async () => ({ population: await data["population.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const year2000 = (context.loaded.population as any[]).filter(
      (d) => d.year === 2000
    );

    Chart(year2000)
      .flow(spread({ by: "age",  dir: "y", reverse: true }))
      .mark(rect({ w: "people" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
