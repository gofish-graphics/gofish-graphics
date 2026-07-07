/**
 * Semantic-zoom histogram — regime 2 (pipeline re-run) + a regime-0 live
 * readout.
 *
 * `wheel({ range, initial })` is read INSIDE `derive()` (a spec read during
 * resolve), so it registers as a pipeline dependency: scrolling re-bins the
 * data and re-runs the whole pipeline (rAF-coalesced). The readout `text`
 * uses `live(...)` content, so its string patches at paint time only.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import {
  chart,
  derive,
  spread,
  rect,
  text,
  live,
  wheel,
} from "../../src/lib";

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

/** Fixed-domain equal-width binning over the passed penguin rows; one row per
 *  bin (empty bins kept so the x band structure stays stable while zooming).
 *  The min/max bin domain is derived from `rows` — fine here because the rows
 *  are the constant full dataset flowing through `derive`. */
function binRows(
  rows: typeof penguins,
  k: number
): { bin: string; count: number }[] {
  const masses = rows
    .map((p) => p[MASS])
    .filter((m): m is number => m !== null);
  const [massMin, massMax] = [Math.min(...masses), Math.max(...masses)];
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

    const bins = wheel({ range: [3, 40], initial: 12, round: true });

    chart(penguins, { axes: true })
      .flow(
        // regime 2: reading bins() in derive() makes it a pipeline dependency,
        // so a wheel tick re-bins the real rows and re-runs resolve → layout →
        // paint.
        derive((rows) => binRows(rows, bins())),
        spread({ by: "bin", dir: "x" })
      )
      .mark(rect({ h: "count" }))
      // regime 0: a component-level annotation tier — live text content patches
      // at paint time only.
      .layer(
        text({
          x: 20,
          y: 290,
          text: live(() => `bins: ${bins()} (scroll to re-bin)`),
          fill: "#333",
        })
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
