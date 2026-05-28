import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { Chart, spread, rect, derive } from "../../src/lib";
import { repeat } from "../../src/lib";
import _ from "lodash";

const meta: Meta = {
  title: "Forward Syntax V3/Waffle Chart",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    Chart(seafood)
      .flow(
        spread({ by: "lake",  spacing: 8, dir: "x" }),
        derive((d) => d.flatMap((d) => repeat(d, "count"))),
        derive((d) => _.chunk(d, 5)),
        spread({ spacing: 2, dir: "y" }),
        spread({ spacing: 2, dir: "x" })
      )
      .mark(rect({ w: 8, h: 8, fill: "species" }))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: true,
      });

    return container;
  },
};
