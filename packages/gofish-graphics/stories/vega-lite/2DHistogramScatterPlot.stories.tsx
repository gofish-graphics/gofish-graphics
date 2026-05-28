import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, circle, scatter, log, rect, v } from "../../src/lib";
import data from "vega-datasets";
import { uniq } from "lodash";

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
  args: { w: 600, h: 300 },
  loaders: [async () => ({ movies: await data["movies.json"]() })],
  render: (args: Args, context: any) => {

    const container = initializeContainer();
    const moviesRaw = context.loaded.movies as any[];
  
    const xbinSize =
      (Math.max(...moviesRaw.map((d) => d["IMDB Rating"])) -
        Math.min(...moviesRaw.map((d) => d["IMDB Rating"]))) /
        10 || 1;
    const ybinSize = (Math.max(...moviesRaw.map((d) => d["Rotten Tomatoes Rating"])) - Math.min(...moviesRaw.map((d) => d["Rotten Tomatoes Rating"]))) / 10 || 1;
    let movies = moviesRaw
        .filter((d) => d["IMDB Rating"] != null && d["Rotten Tomatoes Rating"] != null)
        .map((d) => ({
      x: Math.floor(d["IMDB Rating"] / xbinSize) * xbinSize,
      y: Math.floor(d["Rotten Tomatoes Rating"] / ybinSize) * ybinSize,
    }));

    const xs = uniq(movies.map((d) => d.x));
    const ys = uniq(movies.map((d) => d.y));

    // Build a flat list of (x, y) bin coordinates.
    const coords = xs.flatMap((x) => ys.map((y) => [x, y] as const));

    const counts = coords
      .map(([x, y]) => ({
        x,
        y,
        count: movies.filter((d) => d.x === x && d.y === y).length,
      }))
      .filter((d) => d.count > 0);

    const maxCount = Math.max(1, ...counts.map((d) => d.count));

    // Map counts to mark sizes, capped by bin size so marks stay inside bins.
    const movieCounts = counts.map((d, i) => {
      const t = d.count / maxCount; // 0..1
      const w = Math.max(1, xbinSize * 5 * t) / xs.length;
      const h = Math.max(1, ybinSize * 5 * t) / ys.length;
      const size = Math.min(w, h);
      return { ...d, size, id: i };
    });
    

    Chart(movieCounts) 
      .flow(log("scatter locations"), scatter({ by: "id", x: "x", y: "y", debug: true }))
      // Size each cell by bucket count.
      .mark(
        rect({
          w: "size",
          aspectRatio: 1,
          fill: "transparent",
          stroke: "black",
          strokeWidth: 1,
          rx: 2,
          ry: 2,
        } as any)
      )
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  }
};
