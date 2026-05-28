import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, scatter, circle, log } from "../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/point_2d.html

const meta: Meta = {
  title: "Vega-Lite/Simple Scatter Plot",
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
  args: { w: 300, h: 300 },
  loaders: [async () => ({ cars: await data["cars.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();
    const cars = (context.loaded.cars as any[]).filter(d => d.Horsepower !== null && d.Miles_per_Gallon !== null);

    Chart(cars)
      .flow(log("cars before scatter"), scatter({ by: "Name",  x: "Horsepower", y: "Miles_per_Gallon", debug: true }))
      .mark(circle({ r: 4, fill: "rgba(31, 119, 180, 0.4)", // semi‑transparent blue
        stroke: "#1f77b4",
        strokeWidth: 1,}))

      .render(container, { w: args.w, h: args.h, axes: true } as any);

    return container;
  },
};
