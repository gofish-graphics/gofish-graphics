import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Chart, spread, rect } from "../../src/lib";

/**
 * Probe for the underlying-space collapse (#586). The companion measure-clash
 * probe is now a unit test (`src/tests/space.test.ts`) since it deliberately
 * throws; this one renders, and its geometry distinguishes the two-state
 * `origin: number | null` cut (which over-niced a SIZE axis) from the three-state
 * `number | "free" | "impossible"` model that matches `main`.
 */
const meta: Meta = {
  title: "Forward Syntax V3/Space Unification Probes",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// Tasks laid left-to-right, width ∝ hours, with gaps — a proportional strip.
const tasks = [
  { task: "Design", hours: 18 },
  { task: "Build", hours: 42 },
  { task: "Test", hours: 24 },
  { task: "Ship", hours: 10 },
];

/**
 * Rects spread along x and SIZED along x by `hours`, with 30px gaps and an
 * x-axis. The spread's x distribute folds to a baseline magnitude
 * `SIZE(linear(Σhours, 30·(n−1)))` — a data-driven extent whose intercept is the
 * reserved pixel spacing. A baseline magnitude ("free") is NOT niced, so the
 * root σ solves `(W − 30·(n−1)) / Σhours` and the gaps are reserved. (The
 * two-state cut treated this as `origin 0` → anchored → niced, which overwrote
 * `width` with `linear(niceMax, 0)` and destroyed the intercept → wrong σ.)
 */
export const SpacedSizeAxis: StoryObj<Args> = {
  args: { w: 520, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    // `axes` is a chart-level option (`Chart(data, { axes })`); passing it to
    // `.render()` is silently dropped — its signature omits `axes`, and
    // `resolveForRender` reads the chart-level option instead.
    Chart(tasks, { axes: true })
      .flow(spread({ by: "task", dir: "x", spacing: 30 }))
      .mark(rect({ w: "hours", h: 80, fill: "task" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
