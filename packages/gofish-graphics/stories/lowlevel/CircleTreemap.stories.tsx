import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, treemap, circle, derive, groupBy, sumBy } from "../../src/lib";
import { gray } from "../../src/color";
import data from "vega-datasets";

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
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const moviesRaw = context.loaded.movies as Movie[];

    chart(moviesRaw)
      .flow(
        derive((d) => {
          const grouped = groupBy(
            d.filter((m) => m["Major Genre"] != null),
            (m) => String(m["Major Genre"])
          );
          return Object.entries(grouped)
            .map(([key, values]) => ({
              key,
              worldwideGross: sumBy(
                values,
                (m) => Number(m["Worldwide Gross"]) || 0
              ),
            }))
            .filter((d) => d.worldwideGross > 0);
        }),
        treemap({
          valueField: "worldwideGross",
          paddingInner: args.paddingInner,
          paddingOuter: args.paddingInner,
          round: true,
        })
      )
      .mark(circle({ fill: "key", stroke: gray, strokeWidth: 1, label: true }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
