/**
 * M5 — multi-brush (notes/design/interaction.md).
 *
 * `multi: true` multiplies the brush: each new drag creates another instance
 * (an instance-creation event in the temporal algebra), the selector becomes
 * the compound OR over all instances, and the readout counts selections and
 * selected points live through a DataRef. Escape clears all instances.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { catchLocationsArray } from "../../src/data/catch";
import { chart, scatter, circle } from "../../src/lib";
import { brush, from, overlayText, when } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Multi Brush",
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

    const b = brush({ x: "x", y: "y", multi: true });
    const selected = from(catchLocationsArray).filter((d) => b.inside(d));
    const readout = overlayText({
      x: 70,
      y: 24,
      text: () =>
        `${b.instances().length} selection${
          b.instances().length === 1 ? "" : "s"
        } · ${selected.count()} point${selected.count() === 1 ? "" : "s"} (Esc clears)`,
    });

    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(circle({ r: 6, fill: when(b.inside, "#d62728").else("#9db7d8") }))
      .interact(b, readout)
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
