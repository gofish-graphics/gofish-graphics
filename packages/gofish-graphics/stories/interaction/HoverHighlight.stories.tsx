/**
 * M1 — hover highlight (Tier-0 interaction; notes/design/interaction.md).
 *
 * A `hover()` instrument tracks the data mark under the pointer; the bar's
 * `fill` is a `when(...)` conditional channel. The pipeline renders the
 * `.else` fallback; hovering patches the fill at the paint layer through
 * Solid's per-attribute reactivity — no re-layout, no re-lower.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { hover, when } from "../../src/interaction";

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

    const hov = hover();

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count", fill: when(hov.over, "#d62728").else("#6b9bd1") }))
      .interact(hov)
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
