import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, layer, rect, spread, Schema } from "../../src/lib";
import { genderPayGap, payGrade } from "../../src/data/genderPayGap";

/**
 * A box plot from the chart builder. Each row already holds its summary
 * (`Min`, `25-Percentile`, `Median`, `75-Percentile`, `Max`), so the marks
 * read five different columns on one y axis. The schema declares all five
 * amounts of one quantity, Pay, so they share the axis and it is titled
 * "Pay".
 */
const meta: Meta = {
  title: "Forward Syntax/Box Plot",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 200, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const GenderPayGap: StoryObj<Args> = {
  args: { w: 560, h: 320 },
  render: (args: Args) => {
    const container = initializeContainer();

    const pay = Schema.quantity("Pay");
    chart(genderPayGap, {
      schema: {
        "Pay Grade": Schema.ordered(payGrade),
        Min: pay,
        "25-Percentile": pay,
        Median: pay,
        "75-Percentile": pay,
        Max: pay,
      },
      axes: true,
    })
      .flow(
        spread({ by: "Pay Grade", dir: "x", spacing: 24 }),
        spread({ dir: "x", spacing: 6 })
      )
      .mark(
        layer([
          rect({ x: 7.5, w: 1, y: "Min", y2: "Max", fill: "gray" }),
          rect({ w: 16, y: "25-Percentile", y2: "75-Percentile", fill: "Gender" }),
          rect({ w: 16, h: 1.5, y: "Median", fill: "white" }),
        ])
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
