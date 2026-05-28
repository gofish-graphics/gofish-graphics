import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Chart, spread, rect, v } from "../../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/bar_grouped_repeated.html

const meta: Meta = {
  title: "Vega-Lite/Grouped Bar Chart (Multiple Measure with Repeat)",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 600, h: 300 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    Chart(context.loaded.movies as any[])
      .flow(spread({ by: "Major Genre",  dir: "x" }))
      .mark(
        spread({ dir: "x", spacing: 0 }, [
          rect({ h: "Worldwide Gross", fill: v("Worldwide Gross") }),
          rect({ h: "US Gross", fill: v("US Gross") }),
        ])
      )
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
