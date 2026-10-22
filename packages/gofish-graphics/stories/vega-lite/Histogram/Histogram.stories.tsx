import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, field, rect, spread } from "../../../src/lib";
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
  // Vega-Lite's size: binned and continuous axes with no width or height make
  // a 200 × 200 plot.
  args: { w: 200, h: 200 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Histogram",
      description: "A histogram of movie IMDB ratings, with films binned into rating intervals and each bar's height showing the count of films per bin.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    chart(context.loaded.movies as any[], { w: args.w, h: args.h })
      .flow(
        spread({ by: field("IMDB Rating").bin(), dir: "x", spacing: 1 })
      )
      .mark(rect({ h: field("IMDB Rating").count() }))
      .render(container);

    return container;
  },
};
