import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, scatter, rect, spread, derive } from "../../src/lib";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/tick_strip.html

const meta: Meta = {
  title: "Vega-Lite/Strip Plot",
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
  args: { w: 400, h: 300 },
  loaders: [async () => ({ cars: await data["cars.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    const cars = (context.loaded.cars as any[])
      .filter((d) => d.Horsepower != null && d.Cylinders != null)
      .map((d) => ({
        name: d.Name,
        horsepower: d.Horsepower,
        cylinders: Math.round(d.Cylinders),
      }));

    chart(cars, { axes: { x: { side: "end" }, y: true } })
      .flow(
        // Ascending so cylinders read 3 at the top → 8 at the bottom in y-down.
        derive((d) => [...d].sort((a, b) => a.cylinders - b.cylinders)),
        spread({ by: "cylinders", dir: "y" }),
        scatter({ x: "horsepower" })
      )
      .mark(
        rect({
          w: 1,
          h: 10,
          fill: "rgb(31, 119, 180)",
          opacity: 0.7,
        })
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
