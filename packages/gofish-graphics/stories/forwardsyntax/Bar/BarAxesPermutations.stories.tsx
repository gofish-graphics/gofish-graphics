import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { chart, spread, rect } from "../../../src/lib";
import type { AxesOptions, AxisOptions } from "../../../src/ast/gofish";

const meta: Meta = {
  title: "Forward Syntax/Bar/Axes Permutations",
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

type LabelAngle = Extract<AxisOptions, object>["labelAngle"];

function renderGroupedBar(args: Args, labelAngle: LabelAngle): HTMLElement {
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

// Per-tier labelAngle array: [45] rotates only the innermost (year) row,
// leaving the outer (city) row upright.
export const GroupedLabelAngleInner45: StoryObj<Args> = {
  args: { w: 300, h: 210 },
  render: (args: Args) => renderGroupedBar(args, [45]),
};

export const GroupedLabelAngleInner90: StoryObj<Args> = {
  args: { w: 300, h: 210 },
  render: (args: Args) => renderGroupedBar(args, [90]),
};

// The same grouped bar chart with no labelAngle: the unrotated baseline the
// rotated and "auto" variants are compared against.
export const GroupedLabelAngleNone: StoryObj<Args> = {
  args: { w: 300, h: 210 },
  render: (args: Args) => renderGroupedBar(args, undefined),
};

// labelAngle: "auto" (#486) tries 0°, 45°, then 90° and keeps the first angle
// at which no two labels in a row collide, counting collisions across the
// whole chart (a year label under Austin can hit one under Boston). Each story
// below names the angle it is expected to select.

// Wide enough for upright years: selects 0°.
export const GroupedLabelAngleAuto0: StoryObj<Args> = {
  args: { w: 400, h: 210 },
  render: (args: Args) => renderGroupedBar(args, "auto"),
};

// Narrower than GroupedLabelAngleNone, so upright years would overlap:
// selects 45°.
export const GroupedLabelAngleAuto45: StoryObj<Args> = {
  args: { w: 250, h: 210 },
  render: (args: Args) => renderGroupedBar(args, "auto"),
};

// "Inner labels are often too long": product names under region groups.
const regionProduct = ["Laptops", "Smartphones", "Accessories", "Wearables"]
  .flatMap((product, i) =>
    ["North", "South", "West"].map((region, j) => ({
      region,
      product,
      sales: 30 + ((i * 17 + j * 11) % 40),
    }))
  );

function renderGroupedProducts(args: Args, labelAngle: LabelAngle) {
  const container = initializeContainer();

  chart(regionProduct, { axes: { x: { labelAngle } } })
    .flow(
      spread({ by: "region", dir: "x", spacing: 24 }),
      spread({ by: "product", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "sales", fill: "product" }))
    .render(container, { w: args.w, h: args.h });

  return container;
}

// Wide: the product names fit upright, selects 0°.
export const GroupedLabelAngleAutoLong0: StoryObj<Args> = {
  args: { w: 900, h: 210 },
  render: (args: Args) => renderGroupedProducts(args, "auto"),
};

// Medium: upright names collide, slanted ones clear each other, selects 45°.
export const GroupedLabelAngleAutoLong45: StoryObj<Args> = {
  args: { w: 400, h: 210 },
  render: (args: Args) => renderGroupedProducts(args, "auto"),
};

// Narrow: only vertical names clear each other, selects 90°.
export const GroupedLabelAngleAutoLong90: StoryObj<Args> = {
  args: { w: 220, h: 210 },
  render: (args: Args) => renderGroupedProducts(args, "auto"),
};

// Extremely narrow: every angle collides, so it falls back to the angle with
// the least overlap (90°).
export const GroupedLabelAngleAutoFallback: StoryObj<Args> = {
  args: { w: 90, h: 210 },
  render: (args: Args) => renderGroupedProducts(args, "auto"),
};

// Horizontal grouped bars: an ordinal y axis with "auto". Tall bands leave room
// for upright names, so this selects 0°.
export const GroupedHorizontalLabelAngleAuto0: StoryObj<Args> = {
  args: { w: 300, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();

    chart(regionProduct, { axes: { y: { labelAngle: "auto" } } })
      .flow(
        spread({ by: "region", dir: "y", spacing: 16 }),
        spread({ by: "product", dir: "y", spacing: 0 })
      )
      .mark(rect({ w: "sales", fill: "product" }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};
