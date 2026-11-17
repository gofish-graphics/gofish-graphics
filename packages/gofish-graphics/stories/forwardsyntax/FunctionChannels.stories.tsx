import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { fun, ribbon, stack, Baseline } from "../../src/lib";

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
