/**
 * M3 — brush with selectors + DataRef (notes/design/interaction.md).
 *
 * The Meros walkthrough brush on the GoFish substrate: dragging over a
 * scatter draws a brush rect (Tier-1 overlay), whose interval selector drives
 * linked highlighting live (`during` gating via `brush.inside`), while a mean
 * readout — a DataRef memo chain filtered by the COMMITTED selector — updates
 * only when the drag ends (`onEnd` gating via `brush.insideCommitted`).
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray } from "../../src/data/catch";
import { chart, scatter, circle } from "../../src/lib";
import { brush, from, overlayText, when } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Brush Scatter",
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

    const b = brush({ x: "x", y: "y" });
    const selectedMeanY = from(catchLocationsArray)
      .filter((d) => b.insideCommitted(d))
      .mean((d) => d.y);
    const readout = overlayText({
      x: 70,
      y: 24,
      text: () => {
        const m = selectedMeanY();
        return m === undefined
          ? "brush to select points"
          : `mean y of selection: ${m.toFixed(1)}`;
      },
    });

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(
        circle({ r: 6, fill: when(b.inside, "#d62728").else("#9db7d8") })
      )
      .interact(b, readout)
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
