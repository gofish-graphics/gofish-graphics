/**
 * Hover highlight — the paint tier.
 *
 * `hover.over` is true on the bar under the pointer. The fill is a paint
 * channel whose values are literal colors, so hovering a bar patches only the
 * `fill` attribute, with zero layout re-runs.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect, pointer, when } from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Hover Highlight",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const hover = pointer();

    chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({
          h: "count",
          fill: when(hover.over).then("#d62728").otherwise("#6b9bd1"),
        })
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
