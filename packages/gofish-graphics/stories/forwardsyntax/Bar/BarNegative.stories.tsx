import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, group, rect } from "../../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Bar/Negative",
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

export const Default: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bar Chart with Negative Values",
      description:
        "A bar chart whose values span positive and negative, with bars extending above and below the zero baseline.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const testData = [
      { category: "A", value: -30 },
      { category: "B", value: 80 },
      { category: "C", value: 45 },
      { category: "D", value: 60 },
      { category: "E", value: 20 },
    ];

    chart(testData, { axes: true })
      .flow(spread({ by: "category", dir: "x" }))
      .mark(rect({ h: "value" }))
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};

// Regression (#773): a signed `h` grows from the axis's 0 even when the data
// minimum is not a round number. The y axis nices to [-40, 50]; every bar's
// zero edge must sit exactly on the 0 tick, not on the rounded -40 tick.
export const UnroundedMin: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      [
        { category: "A", value: 30 },
        { category: "B", value: -20 },
        { category: "C", value: 45 },
        { category: "D", value: -35 },
        { category: "E", value: 10 },
        { category: "F", value: -5 },
      ],
      { axes: true }
    )
      .flow(spread({ by: "category", dir: "x" }))
      .mark(rect({ h: "value" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Regression (#773): every value negative. The bars hang down from the 0 tick
// at the top of the axis.
export const AllNegative: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      [
        { category: "A", value: -12 },
        { category: "B", value: -37 },
        { category: "C", value: -23 },
        { category: "D", value: -8 },
      ],
      { axes: true }
    )
      .flow(spread({ by: "category", dir: "x" }))
      .mark(rect({ h: "value" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Regression (#773): a spine (back-to-back bars) from a signed `w` inside
// `group`. The group keeps both sides of its baseline, so the x axis spans
// both signs, the two bars of a row meet on the 0 tick, and the chart fits its
// requested width.
export const SignedSpine: StoryObj<Args> = {
  args: { w: 400, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      [
        { country: "A", gender: "Women", signed: -33 },
        { country: "A", gender: "Men", signed: 67 },
        { country: "B", gender: "Women", signed: -46 },
        { country: "B", gender: "Men", signed: 54 },
        { country: "C", gender: "Women", signed: -52 },
        { country: "C", gender: "Men", signed: 48 },
      ],
      { axes: true }
    )
      .flow(spread({ by: "country", dir: "y" }), group({ by: "gender" }))
      .mark(rect({ w: "signed", fill: "gender" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
