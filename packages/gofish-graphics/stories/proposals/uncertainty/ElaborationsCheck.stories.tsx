import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, layer, line, scatter, spread } from "../../../src/lib";
import { dist, dots, interval, slab } from "./elaborations";
import { fanHistory, halfEyeGroups, pointIntervalGroups } from "./signal-data";

/**
 * The signal prototypes of Signal.stories.tsx, drawn with the definitions in
 * `elaborations.ts` from normal and lognormal Dists. No grid, quantile or
 * interval is precomputed: the marks compute them from the parameters.
 */
const meta: Meta = { title: "Proposals/Uncertainty/Elaborations" };
export default meta;

const INK = "#1f3b5c";
const SLAB = "#9ebcda";

export const HalfEye: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const value = dist.normal({ mean: "mean", sd: "sd" });
    chart(halfEyeGroups, { w: 520, axes: { x: { title: "value" }, y: true } })
      .flow(spread({ by: "group", dir: "y", anchor: "baseline", spacing: 64 }))
      .mark(
        layer({ h: 60 }, [
          slab({ x: value, fill: SLAB }),
          interval({ x: value, levels: [0.66, 0.95], fill: INK }),
        ])
      )
      .render(container);
    return container;
  },
};

// A check of slab's other options: side start, side both, and normalize
// group, on two of the half-eye's normals.
export const SlabOptions: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const value = dist.normal({ mean: "mean", sd: "sd" });
    chart(halfEyeGroups.slice(1, 3), {
      w: 520,
      axes: { x: { title: "value" }, y: true },
    })
      .flow(spread({ by: "group", dir: "y", spacing: 32 }))
      .mark(
        layer({ h: 60 }, [
          slab({ x: value, side: "both", normalize: "group", fill: SLAB }),
          slab({ x: value, side: "start", fill: INK, opacity: 0.4 }),
          interval({ x: value, fill: INK }),
        ])
      )
      .render(container);
    return container;
  },
};

export const PointInterval: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const value = dist.normal({ mean: "mean", sd: "sd" });
    chart(pointIntervalGroups, {
      w: 480,
      axes: { x: { title: "value" }, y: true },
    })
      .flow(spread({ by: "group", dir: "y", spacing: 16 }))
      .mark(interval({ x: value, levels: [0.66, 0.95], fill: INK }))
      .render(container);
    return container;
  },
};

export const QuantileDotplot: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const minutes = dist.lognormal({ meanlog: "meanlog", sdlog: "sdlog" });
    chart([{ meanlog: Math.log(11), sdlog: 0.45 }], {
      w: 480,
      h: 160,
      axes: { x: { title: "minutes until the bus arrives" }, y: false },
    })
      .mark(
        dots({
          x: minutes,
          n: 20,
          binning: { kind: "wilkinson", width: 1 },
          fill: SLAB,
          stroke: INK,
        })
      )
      .render(container);
    return container;
  },
};

// The forecast: 21 steps whose sd grows with the square root of the horizon,
// starting at the last observed value.
const last = fanHistory[fanHistory.length - 1].value;
const forecast = Array.from({ length: 21 }, (_, h) => ({
  t: h,
  median: last + 0.6 * h,
  sd: 2.2 * Math.sqrt(h),
}));

export const FanChart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const value = dist.normal({ mean: "median", sd: "sd" });
    layer([
      chart(forecast).mark(
        interval({
          y: value,
          along: "t",
          levels: [0.5, 0.8, 0.95],
          fill: "#3a6ea5",
        })
      ),
      chart(fanHistory)
        .flow(scatter({ by: "t", x: "t", y: "value" }))
        .mark(line({ stroke: "#333", strokeWidth: 1.5 })),
    ]).render(container, {
      w: 520,
      h: 300,
      axes: { x: { title: "time step" }, y: { title: "value" } },
    });
    return container;
  },
};
