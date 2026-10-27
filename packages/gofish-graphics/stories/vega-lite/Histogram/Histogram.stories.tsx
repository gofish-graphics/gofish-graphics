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
  // a 300 × 300 plot, Vega-Lite's default (its compiled histogram plot).
  args: { w: 300, h: 300 },
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
