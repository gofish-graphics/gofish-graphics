/**
 * M6 — wheel → bin-count parameter binding (Tier 2;
 * notes/design/interaction.md; Meros Fig. 8's semantic-zoom histogram).
 *
 * A `param` holds the histogram's bin count; the spec consumes it inside
 * `derive(...)`, which re-runs at resolve time. A `wheelBind` maps wheel
 * input through an interaction scale onto the param and invalidates the
 * runtime, whose rAF-coalesced, latest-wins scheduler re-resolves and
 * re-renders — the full pipeline re-runs per change (coarse Tier 2), with
 * per-frame latency logged to the console as the performance gate.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { chart, derive, spread, rect } from "../../src/lib";
import { param, wheelBind, overlayText } from "../../src/interaction";

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

    const bins = param(12);
    const readout = overlayText({
      x: 70,
      y: 20,
      text: () => `bins: ${bins.value()} (scroll to re-bin)`,
    });

    const t0 = { last: 0 };
    chart(null as never, { axes: true })
      .flow(
        // The param is consumed HERE: derive re-runs per resolve, so each
        // Tier-2 re-render re-bins at the current value.
        derive(() => {
          t0.last = performance.now();
          return binRows(bins.value());
        }),
        spread({ by: "bin", dir: "x" })
      )
      .mark(rect({ h: "count" }))
      .interact(
        wheelBind(bins, {
          domain: [0, 600],
          range: [3, 40],
          round: true,
          sensitivity: 1,
        }),
        readout,
        {
          onFrame() {
            if (t0.last) {
              // The performance gate: resolve→layout→lower per re-bin.
              console.log(
                `[gofish tier-2] re-render took ${(
                  performance.now() - t0.last
                ).toFixed(1)}ms at ${bins.value()} bins`
              );
            }
          },
        }
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
