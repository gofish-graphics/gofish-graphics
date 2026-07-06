/**
 * M4 — snap-to-band brush (the Match relation; notes/design/interaction.md).
 *
 * A brush over a bar chart whose x edges snap to band edges: `xBands()`
 * exposes the bars' x-extents as a keyed Set⟨Range⟩ anchor, and binding it to
 * the brush's x range anchor with `{ by: "nearest" }` resolves to Match —
 * every write of the brush extent lands snapped, so it is impossible to
 * half-select a category (Meros Fig. 4 B, composed from primitives). Bars
 * whose band center falls inside the brush highlight via the geometric
 * `intersectsX` selector.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { bind, brush, xBands, when } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Snap Brush",
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

    const bands = xBands();
    const b = brush({ x: "x", y: "y" });
    // Match: brush x edges snap to the nearest band edge on every write.
    bind(bands.anchor, b.anchors.x, { by: "nearest" });

    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(
        rect({ h: "count", fill: when(b.intersectsX, "#d62728").else("#6b9bd1") })
      )
      .interact(b, bands)
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
