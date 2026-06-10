import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Treemap, rect, v, circle } from "../../src/lib";
import { gray } from "../../src/color";
import data from "vega-datasets";
import { groupBy } from "lodash";

const meta: Meta = {
  title: "Low Level Syntax/Treemap",
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

export const Default: StoryObj<Args> = {
  args: { w: 700, h: 420, paddingInner: 2 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
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
          rect<{ key: string; values: Movie[]; worldwideGross: number }>({
            // Make fill data-driven by genre so the built-in label shows the genre name.
            fill: v(d.key),
            stroke: gray,
            strokeWidth: 1,
            rx: 2, 
            ry: 2,
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
        tile: "squarify",
      },
      nodes as any
    ).render(container, { w: args.w, h: args.h });

    return container;
  },
};

