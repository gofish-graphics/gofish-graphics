/**
 * M6 — wheel → bin-count parameter binding (Tier 2;
 * notes/design/interaction.md; Meros Fig. 8's semantic-zoom histogram).
 *
 * Fluent surface: `wheel({ range, initial })` is a LIVE VALUE — the third
 * value kind after aesthetic literals and `v()` data values. Reading it
 * inside `derive()` both returns the current bin count and registers the
 * wheel input with the chart (a tracked read during resolve); wheel events
 * then invalidate the Tier-2 scheduler, which re-resolves and re-renders.
 * No `.interact()` clause at all: the parameter registers itself, and the
 * readout is a text mark with `live(...)` content.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { chart, derive, spread, rect, text } from "../../src/lib";
import { live, wheel } from "../../src/interaction";

const meta: Meta = {
  title: "Interaction/Semantic Zoom Histogram",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const MASS = "Body Mass (g)";
const masses = penguins
  .map((p) => p[MASS])
  .filter((m): m is number => m !== null);
const [massMin, massMax] = [Math.min(...masses), Math.max(...masses)];

/** Fixed-domain equal-width binning; one row per bin (empty bins kept so the
 *  x band structure stays stable while zooming). */
function binRows(k: number): { bin: string; count: number }[] {
  const width = (massMax - massMin) / k;
  const counts = new Array<number>(k).fill(0);
  for (const m of masses) {
    const i = Math.min(k - 1, Math.floor((m - massMin) / width));
    counts[i]++;
  }
  return counts.map((count, i) => ({
    bin: String(Math.round(massMin + i * width)),
    count,
  }));
}

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    // A live parameter: reads during resolve register the wheel input.
    const bins = wheel({ range: [3, 40], initial: 12, round: true });

    chart(null as never, { axes: true })
      .flow(
        derive(() => binRows(bins())),
        spread({ by: "bin", dir: "x" })
      )
      .mark(rect({ h: "count" }))
      .layer(
        chart(null).mark(
          text({
            x: 20,
            y: 290,
            text: live(() => `bins: ${bins()} (scroll to re-bin)`),
            fill: "#333",
          })
        )
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
