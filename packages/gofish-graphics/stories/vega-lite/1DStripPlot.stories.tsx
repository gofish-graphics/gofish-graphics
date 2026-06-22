import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, scatter, rect, log } from "../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/tick_dot.html

const meta: Meta = {
  title: "Vega-Lite/1D Strip Plot",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 300, h: 50 },
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

    chart(context.loaded.weather as any[], { axes: { x: true, y: false } })
      .flow(scatter({ by: "date",  x: "precipitation" }))
      .mark(rect({ w: 1, h: 10, fill: "rgb(31, 119, 180)",
        opacity: 0.7,
      }))

      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
