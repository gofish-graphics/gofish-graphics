import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { chart, spread, rect } from "../../../src/lib";
import type { AxesOptions, AxisOptions } from "../../../src/ast/gofish";

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

  chart(seafood, { axes })
    .flow(spread({ by: "lake",  dir: "x" }))
    .mark(rect({ h: "count" }))
    .render(container, {
      w: args.w,
      h: args.h,
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

// labelAngle (#746): a nested grouped bar chart (city, then year) at a small
// thumbnail size, where the unrotated category labels would collide under the
// bars. Two-tier x axis: labelAngle applies to both the inner (year) and
// outer (city) label rows.
const cityYear = [
  { city: "Austin", year: "2022", visitors: 42 },
  { city: "Austin", year: "2023", visitors: 58 },
  { city: "Austin", year: "2024", visitors: 71 },
  { city: "Boston", year: "2022", visitors: 55 },
  { city: "Boston", year: "2023", visitors: 49 },
  { city: "Boston", year: "2024", visitors: 63 },
  { city: "Chicago", year: "2022", visitors: 38 },
  { city: "Chicago", year: "2023", visitors: 44 },
  { city: "Chicago", year: "2024", visitors: 51 },
];

function renderGroupedBar(args: Args, labelAngle: number): HTMLElement {
  const container = initializeContainer();

  chart(cityYear, { axes: { x: { labelAngle } } })
    .flow(
      spread({ by: "city", dir: "x", spacing: 24 }),
      spread({ by: "year", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "visitors", fill: "year" }))
    .render(container, { w: args.w, h: args.h });

  return container;
}

export const GroupedLabelAngle45: StoryObj<Args> = {
  args: { w: 300, h: 210 },
  render: (args: Args) => renderGroupedBar(args, 45),
};

export const GroupedLabelAngle90: StoryObj<Args> = {
  args: { w: 300, h: 210 },
  render: (args: Args) => renderGroupedBar(args, 90),
};
