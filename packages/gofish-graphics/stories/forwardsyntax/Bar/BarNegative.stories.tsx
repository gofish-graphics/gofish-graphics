import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, stack, group, rect } from "../../../src/lib";

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

    chart(testData)
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
      ]
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
      ]
    )
      .flow(spread({ by: "category", dir: "x" }))
      .mark(rect({ h: "value" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Regression (#773): signed data (cash flow, with outflows negative) as a
// signed `w` inside `group`. The group keeps both sides of its baseline, so the
// x axis spans both signs, the two bars of a row meet on the 0 tick, and the
// chart fits its requested width.
export const SignedGroup: StoryObj<Args> = {
  args: { w: 400, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      [
        { quarter: "Q1", flow: "Inflow", amount: 67 },
        { quarter: "Q1", flow: "Outflow", amount: -33 },
        { quarter: "Q2", flow: "Inflow", amount: 54 },
        { quarter: "Q2", flow: "Outflow", amount: -46 },
        { quarter: "Q3", flow: "Inflow", amount: 48 },
        { quarter: "Q3", flow: "Outflow", amount: -52 },
      ]
    )
      .flow(spread({ by: "quarter", dir: "y" }), group({ by: "flow" }))
      .mark(rect({ w: "amount", fill: "flow" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Cash flows per quarter: inflows are positive, outflows negative.
const cashFlows = [
  { quarter: "Q1", flow: "Sales", direction: "Inflow", amount: 60 },
  { quarter: "Q1", flow: "Refunds", direction: "Outflow", amount: -15 },
  { quarter: "Q1", flow: "Services", direction: "Inflow", amount: 20 },
  { quarter: "Q1", flow: "Costs", direction: "Outflow", amount: -40 },
  { quarter: "Q2", flow: "Sales", direction: "Inflow", amount: 30 },
  { quarter: "Q2", flow: "Refunds", direction: "Outflow", amount: -25 },
  { quarter: "Q2", flow: "Services", direction: "Inflow", amount: 10 },
  { quarter: "Q2", flow: "Costs", direction: "Outflow", amount: -50 },
  { quarter: "Q3", flow: "Sales", direction: "Inflow", amount: 45 },
  { quarter: "Q3", flow: "Refunds", direction: "Outflow", amount: -5 },
  { quarter: "Q3", flow: "Services", direction: "Inflow", amount: 15 },
  { quarter: "Q3", flow: "Costs", direction: "Outflow", amount: -20 },
];

// Regression (#773): a stack lays its parts end to end in order, so a
// negative part goes back down. Each column starts at the 0 tick and ends at
// its quarter's net (Q1 25, Q2 −35, Q3 35); parts overlap where they cancel.
export const MixedSignStack: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(cashFlows)
      .flow(
        spread({ by: "quarter", dir: "x" }),
        stack({ by: "flow", dir: "y" })
      )
      .mark(rect({ h: "amount", fill: "flow" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Regression (#773): a stack of outflows only hangs down from the 0 tick at
// the top of the axis.
export const AllNegativeStack: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      cashFlows.filter((d) => d.direction === "Outflow")
    )
      .flow(
        spread({ by: "quarter", dir: "x" }),
        stack({ by: "flow", dir: "y" })
      )
      .mark(rect({ h: "amount", fill: "flow" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Regression (#773): a diverging stacked bar. Group by the sign first, then
// stack each side: inflows pile up from the 0 tick and outflows pile down
// from it.
export const DivergingStack: StoryObj<Args> = {
  args: { w: 400, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(cashFlows)
      .flow(
        spread({ by: "quarter", dir: "x" }),
        group({ by: "direction" }),
        stack({ by: "flow", dir: "y" })
      )
      .mark(rect({ h: "amount", fill: "flow" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Regression (#773): a waterfall column. Each change starts where the last
// one ended, so the column rises to 100, steps back and forth, and ends at 50.
export const WaterfallColumn: StoryObj<Args> = {
  args: { w: 200, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      [
        { step: "Starting revenue", change: 100 },
        { step: "Churn", change: -30 },
        { step: "Expansion", change: 20 },
        { step: "Contraction", change: -50 },
        { step: "New business", change: 10 },
      ]
    )
      .flow(stack({ by: "step", dir: "y" }))
      .mark(rect({ w: 40, h: "change", fill: "step" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
