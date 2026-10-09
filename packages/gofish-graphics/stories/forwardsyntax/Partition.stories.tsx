import type { Meta, StoryObj } from "@storybook/html";
import data from "vega-datasets";
import { initializeContainer } from "../helper";
import {
  chart,
  Color,
  field,
  partition,
  region,
  text,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";

const meta: Meta = {
  title: "Forward Syntax/Partition",
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

// The penguins with both a flipper length and a body mass.
const measured = penguins.filter(
  (d) => d["Flipper Length (mm)"] !== null && d["Body Mass (g)"] !== null
);

// Mirrors https://vega.github.io/vega-lite/examples/heatmap_histogram.html
export const MovieRatingsHeatmap: StoryObj<Args> = {
  args: { w: 480, h: 320 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "2D Histogram of Movie Ratings",
      description:
        "Movies binned by their IMDB rating and their Rotten Tomatoes rating, with each cell colored by how many movies fall in it.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const movies = (context.loaded.movies as any[]).filter(
      (d) => d["IMDB Rating"] != null && d["Rotten Tomatoes Rating"] != null
    );
    chart(movies, { color: Color.gradient("blues"), axes: true })
      .flow(
        partition({
          by: {
            x: field("IMDB Rating").bin({ step: 0.5 }),
            y: field("Rotten Tomatoes Rating").bin({ step: 5 }),
          },
        })
      )
      .mark(region({ fill: field("IMDB Rating").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// The product form and the nested form below draw the same cells: the
// product form is defined as the nested one.
export const ProductForm: StoryObj<Args> = {
  args: { w: 320, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { color: Color.gradient("blues"), axes: true })
      .flow(
        partition({
          by: {
            x: field("Flipper Length (mm)").bin({ step: 10 }),
            y: field("Body Mass (g)").bin({ step: 500 }),
          },
        })
      )
      .mark(region({ fill: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const NestedForm: StoryObj<Args> = {
  args: { w: 320, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { color: Color.gradient("blues"), axes: true })
      .flow(
        partition({
          by: field("Flipper Length (mm)").bin({ step: 10 }),
          dir: "x",
        }),
        partition({
          by: field("Body Mass (g)").bin({ step: 500 }),
          dir: "y",
          alignment: "middle",
        })
      )
      .mark(region({ fill: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const PenguinCellCounts: StoryObj<Args> = {
  args: { w: 420, h: 320 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Counts by Flipper Length and Body Mass",
      description:
        "Penguins binned by flipper length and body mass, with the number of penguins in each cell written at the cell's center.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(measured, { axes: true })
      .flow(
        partition({
          by: {
            x: field("Flipper Length (mm)").bin({ step: 10 }),
            y: field("Body Mass (g)").bin({ step: 500 }),
          },
        })
      )
      .mark(text({ text: field("Body Mass (g)").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
