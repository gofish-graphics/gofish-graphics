import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { Chart, spread, rect } from "../../../src/lib";
import type { AxesOptions } from "../../../src/ast/gofish";

const meta: Meta = {
  title: "Forward Syntax V3/Bar/Axes Permutations",
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

function renderBar(args: Args, axes: AxesOptions): HTMLElement {
  const container = initializeContainer();

  Chart(seafood)
    .flow(spread({ by: "lake",  dir: "x" }))
    .mark(rect({ h: "count" }))
    .render(container, {
      w: args.w,
      h: args.h,
      axes,
    });

  return container;
}

export const AxesTrue: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, true),
};

export const AxesFalse: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, false),
};

export const AxesXYTrue: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, { x: true, y: true }),
};

export const AxesXOnly: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, { x: true, y: false }),
};

export const AxesYOnly: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, { x: false, y: true }),
};

export const AxesXYFalse: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, { x: false, y: false }),
};

// y is undefined, only x axis shown
export const AxesXOnlyUndefinedY: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, { x: true }),
};

// x is undefined, only y axis shown
export const AxesYOnlyUndefinedX: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => renderBar(args, { y: true }),
};

// explicit title override on x, inferred on y
export const AxesCustomXTitle: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) =>
    renderBar(args, { x: { title: "Custom X Title" }, y: true }),
};

// title: false suppresses the inferred title
export const AxesSuppressedTitle: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) =>
    renderBar(args, { x: { title: false }, y: true }),
};
