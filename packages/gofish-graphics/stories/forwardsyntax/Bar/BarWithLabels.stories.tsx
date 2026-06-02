import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import {
  Chart,
  spread,
  rect,
  layer,
  select,
  text,
  ref,
  sumBy,
  group,
} from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/With Labels",
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

    layer([
      Chart(seafood)
        .flow(spread({ by: "lake",  dir: "x" }))
        .mark(rect({ h: "count" }).name("bars")),
      Chart(select("bars") as any)
        .flow(group({ by: "lake" }) as any)
        .mark(((d: any[]) => {
          return spread({ dir: "y", alignment: "middle", spacing: 10 },
            [
              ref(d[0] as any),
              text({ text: String(sumBy(d, "count")) }),
            ]
          );
        }) as any),
    ] as any).render(container, {
      w: args.w,
      h: args.h,
      axes: true
    });

    return container;
  },
};