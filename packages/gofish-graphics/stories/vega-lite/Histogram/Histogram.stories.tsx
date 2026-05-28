import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Chart, bin, derive, rect, scatter } from "../../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/histogram.html

const meta: Meta = {
  title: "Vega-Lite/Histogram/Histogram",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    Chart(context.loaded.movies as any[])
      .flow(
        derive(bin("IMDB Rating")),
        scatter({ xMin: "start", xMax: "end" })
      )
      .mark(rect({ h: "count" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
