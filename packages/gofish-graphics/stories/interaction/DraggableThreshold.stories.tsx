/**
 * M2 — draggable threshold (Tier-1 interaction; notes/design/interaction.md).
 *
 * A `threshold()` instrument overlays a draggable rule on a bar chart. The
 * threshold value is a writable data-space scalar anchor: a drag input is
 * Equate-bound to it (px → data conversion at the anchor seam) and the y data
 * domain Limit-binds it (clamp in the setter). Bars above the line recolor
 * live through `when(...)` states — zero layout re-runs while dragging.
 */
import type { Meta, StoryObj } from "@storybook/html";
import sumBy from "lodash/sumBy";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { threshold, when } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Draggable Threshold",
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

    const t = threshold({
      at: 100,
      of: (d) => sumBy(d as Record<string, number>[], "count"),
    });

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({ h: "count", fill: when(t.above, "#d62728").else("#6b9bd1") })
      )
      .interact(t)
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
