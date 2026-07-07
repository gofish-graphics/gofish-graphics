/**
 * Timer pulse — the testing story for both regimes, driven by `timer()`.
 *
 * PaintOnly: the timer is read inside a `live()` fill → paint patches only
 * (bars pulse color by tick parity; zero layout re-runs).
 *
 * GrowingData: the timer is read inside `derive()` → it is a pipeline
 * dependency, so each tick re-derives the data (a rolling window) and re-runs
 * the whole pipeline (rAF-coalesced).
 *
 * capture-one snapshots a single (early) frame; either variant should render a
 * sane bar chart with no thrown errors.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, derive, spread, rect, live, timer } from "../../src/lib";

const meta: Meta = {
  title: "Interaction/Timer Pulse",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const base = [
  { cat: "a", count: 30 },
  { cat: "b", count: 80 },
  { cat: "c", count: 45 },
  { cat: "d", count: 60 },
];

/** regime 0: timer read only inside live() → the fill pulses at paint time,
 *  the layout never re-runs. */
export const PaintOnly: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    const t = timer({ interval: 400 });

    chart(base, { axes: true })
      .flow(spread({ by: "cat", dir: "x" }))
      .mark(
        rect({
          h: "count",
          fill: live(() => (t() % 2 === 0 ? "#6b9bd1" : "#d62728")),
        })
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

/** regime 2: timer read inside derive() → each tick re-derives a rolling
 *  window of points and re-runs the whole pipeline. */
export const GrowingData: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    const t = timer({ interval: 500 });
    const WINDOW = 20;

    chart(null as never, { axes: true })
      .flow(
        derive(() => {
          const n = t();
          // Rolling window of the last WINDOW ticks; height is a bounded sine
          // of the tick index so the chart stays legible as it scrolls.
          const start = Math.max(0, n - WINDOW + 1);
          return Array.from({ length: n - start + 1 }, (_, i) => {
            const k = start + i;
            return { t: String(k), count: 20 + Math.round(15 * (1 + Math.sin(k / 2))) };
          });
        }),
        spread({ by: "t", dir: "x" })
      )
      .mark(rect({ h: "count", fill: "#6b9bd1" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
