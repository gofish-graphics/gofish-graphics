/**
 * Hover highlight — regime 0 (paint-only).
 *
 * A `pointer()` input is read INSIDE a `live()` fill channel: hovering a bar
 * re-evaluates the thunk at paint time and patches only the `fill` attribute —
 * zero layout re-runs. The bar's live thunk is bound to the same stamped datum
 * that `pointer().datum()` returns on hit-test, so reference (`===`) comparison
 * identifies the hovered bar.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect, live, pointer } from "../../src/lib";

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

    const p = pointer();

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      // regime 0: the pointer read lives inside live() → paint patch only.
      .mark(
        rect({
          h: "count",
          fill: live((d) => (d === p.datum() ? "#d62728" : "#6b9bd1")),
        })
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
