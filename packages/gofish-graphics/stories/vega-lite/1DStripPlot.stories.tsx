import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, scatter, rect } from "../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/tick_dot.html

const meta: Meta = {
  title: "Vega-Lite/1D Strip Plot",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number };

export const Default: StoryObj<Args> = {
  // Vega-Lite's size: a continuous x with no width is 300 px wide, Vega-Lite's
  // default (its compiled tick_dot plot is 300 × 20).
  args: { w: 300 },
  loaders: [async () => ({ weather: await data["seattle-weather.csv"]() })],
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "1D Strip Plot",
      description: "A one-dimensional strip plot showing the distribution of daily precipitation in Seattle as thin tick marks along a single axis.",
    },
  },
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    chart(context.loaded.weather as any[], { axes: { x: true, y: false }, w: args.w })
      .flow(scatter({ by: "date",  x: "precipitation" }))
      .mark(rect({ w: 1, h: 10, fill: "rgb(31, 119, 180)",
        opacity: 0.7,
      }))

      .render(container);

    return container;
  },
};
