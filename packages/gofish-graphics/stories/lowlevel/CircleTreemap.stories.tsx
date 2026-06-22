import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Treemap, rect, v, circle } from "../../src/lib";
import { gray } from "../../src/color";
import data from "vega-datasets";
import { groupBy } from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/CircleTreemap",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    paddingInner: { control: { type: "number", min: 0, max: 20, step: 1 } },
  },
};
export default meta;

type Args = { w: number; h: number; paddingInner: number };

type Movie = {
  Title: string;
  "Major Genre": string | null;
  "Worldwide Gross": number | null;
};

// const data: Item[] = Array.from({ length: 40 }, (_, i) => {
//   const group = ["A", "B", "C", "D"][i % 4];
//   const value = ((i * 7) % 23) + 1;
//   return { name: `Item ${i + 1}`, group, value };
// });

export const Default: StoryObj<Args> = {
  args: { w: 700, h: 420, paddingInner: 2 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Circle Treemap",
      description:
        "Movie counts by major genre shown as a bubble chart of nested circles sized by each genre's frequency.",
    },
  },
  render: async (args: Args, context: any) => {
    const container = initializeContainer();
    const moviesRaw = context.loaded.movies as Movie[];

    const moviesGrouped = groupBy(
      moviesRaw.filter((d) => d["Major Genre"] != null),
      (d) => String(d["Major Genre"])
    );
    // Flatten grouped data into explicit nodes (avoid relying on array .groupBy()).
    const nodes = await Promise.all(
      Object.entries(moviesGrouped)
        .map(([key, values]) => {
          const worldwideGross = values.reduce(
            (acc, d) => acc + (Number(d["Worldwide Gross"]) || 0),
            0
          );
          return { key, values, worldwideGross };
        })
        .filter((d) => d.worldwideGross > 0)
        .map((d) =>
          circle<{ key: string; values: Movie[]; worldwideGross: number }>({
            // Make fill data-driven by genre so the built-in label shows the genre name.
            fill: v(d.key),
            stroke: gray,
            strokeWidth: 1,
            label: true,
          })(d, d.key)
        )
    );

    Treemap(
      {
        valueField: "worldwideGross",
        paddingInner: args.paddingInner,
        paddingOuter: args.paddingInner,
        round: true,
      },
      nodes as any
    ).render(container, { w: args.w, h: args.h });

    return container;
  },
};

