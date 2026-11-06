import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Bin, chart, circle, field, partition } from "../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/circle_binned.html

const meta: Meta = {
  title: "Vega-Lite/2D Histogram Scatter Plot",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  // Vega-Lite's size: binned continuous axes with no width or height make a
  // 300 × 300 plot, Vega-Lite's default (its compiled circle_binned plot).
  args: { w: 300, h: 300 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const movies = (context.loaded.movies as any[]).filter(
      (d) => d["IMDB Rating"] != null && d["Rotten Tomatoes Rating"] != null
    );

    // One cell per pair of bins, and in it a circle whose area is the
    // number of movies in the cell. The largest circle fits its cell.
    chart(movies, { w: args.w, h: args.h })
      .flow(
        partition({
          by: {
            x: field("IMDB Rating").bin(Bin.step(1)),
            y: field("Rotten Tomatoes Rating").bin(Bin.step(10)),
          },
        })
      )
      .mark(
        circle({
          area: field("IMDB Rating").count(),
          fill: "transparent",
          stroke: "black",
          strokeWidth: 1,
        })
      )
      .render(container);

    return container;
  },
};
