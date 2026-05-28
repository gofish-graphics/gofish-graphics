import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Chart, spread, stack, rect, derive, log, palette } from "../../../src/lib";
import { groupBy, sumBy } from "lodash";
import data from "vega-datasets";

// Mirrors: https://vega.github.io/vega-lite/examples/stacked_bar_normalize.html

const meta: Meta = {
  title: "Vega-Lite/Normalized Stacked Bar Chart",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};

export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  loaders: [async () => ({ population: await data["population.json"]() })],
  render: (args: Args, context: any) => {
    const container = initializeContainer();

    Chart(context.loaded.population.filter((row) => row.year === 2000) as any[], {
      color: palette({ Female: "#675193", Male: "#ca8861" }),
    })
      .flow(
        derive((d) =>
          d.map((row) => ({ ...row, sex: row.sex === 1 ? "Male" : "Female" }))
        ),
        spread({ by: "age",  dir: "x" }),
        derive((d) =>
          d.map((row) => ({
            ...row,
            proportion: row.people / sumBy(d, "people"),
          }))
        ),
        stack({ by: "sex",  dir: "y" })
      )
      .mark(rect({ h: "proportion", fill: "sex" }))
      .render(container, { w: args.w, h: args.h, axes: true });

    return container;
  },
};
