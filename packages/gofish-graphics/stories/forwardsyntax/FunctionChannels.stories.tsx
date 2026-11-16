import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import {
  chart,
  circle,
  fun,
  layer,
  line,
  ribbon,
  scatter,
  stack,
  Baseline,
} from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Function Channels",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

const measured = penguins.filter(
  (p) => p["Flipper Length (mm)"] !== null && p["Body Mass (g)"] !== null
);

/** The least-squares line through the points `(x, y)`, over the extent of
 *  the x. */
const leastSquares = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  return fun((t) => my + slope * (t - mx), {
    domain: [Math.min(...xs), Math.max(...xs)],
  });
};

export const TrendLine: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    const trend = leastSquares(
      measured.map((p) => p["Flipper Length (mm)"]!),
      measured.map((p) => p["Body Mass (g)"]!)
    );
    layer([
      chart(measured)
        .flow(scatter({ x: "Flipper Length (mm)", y: "Body Mass (g)" }))
        .mark(circle({ r: 2.5, fill: "#9aa7b8" })),
      line({ x: trend.support(), y: trend, stroke: "#c0392b", strokeWidth: 2 }),
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};

const bump = fun((t) => 1 + Math.exp(-((t - 4) ** 2)), { domain: [0, 10] });
const wave = fun((t) => 1 + 0.6 * Math.sin(t), { domain: [0, 10] });

export const StackedFunctions: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    stack({ dir: "y" }, [
      ribbon({ x: bump.support(), h: bump, fill: "#4c78a8" }),
      ribbon({ x: wave.support(), h: wave, fill: "#f58518" }),
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};

export const StackedFunctionsMiddle: StoryObj<Args> = {
  args: { w: 500, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();

    stack({ dir: "y", baseline: Baseline.middle() }, [
      ribbon({ x: bump.support(), h: bump, fill: "#4c78a8" }),
      ribbon({ x: wave.support(), h: wave, fill: "#f58518" }),
    ]).render(container, { w: args.w, h: args.h });

    return container;
  },
};
