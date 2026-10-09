import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  scatter,
  spread,
  stack,
  group,
  ribbon,
  line,
  circle,
  blank,
  Color,
  Curve,
  Schema,
} from "../../src/lib";

// Ports of the three reference programs of the authoring benchmark (#941,
// #955) that placed dates at decimal years by hand, because GoFish had no
// time scale: create/area, create/circle-timeline and
// create/surplus-deficit-line. The benchmark lives outside this repo
// (gofish-graphics/vis-authoring-bench); its data is copied here.

const meta: Meta = {
  title: "Forward Syntax/Time/Benchmark Ports",
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

// A synthetic store's sales per category and quarter (the benchmark's
// `quarterly-sales.json`).
const quarterlySales = [
  { date: "2016-03-01", category: "Furniture", sales: 25467 },
  { date: "2016-03-01", category: "Office Supplies", sales: 19116 },
  { date: "2016-03-01", category: "Technology", sales: 22865 },
  { date: "2016-06-01", category: "Furniture", sales: 21497 },
  { date: "2016-06-01", category: "Office Supplies", sales: 32774 },
  { date: "2016-06-01", category: "Technology", sales: 43646 },
  { date: "2016-09-01", category: "Furniture", sales: 36563 },
  { date: "2016-09-01", category: "Office Supplies", sales: 39131 },
  { date: "2016-09-01", category: "Technology", sales: 54133 },
  { date: "2016-12-01", category: "Furniture", sales: 55789 },
  { date: "2016-12-01", category: "Office Supplies", sales: 56485 },
  { date: "2016-12-01", category: "Technology", sales: 71076 },
  { date: "2017-03-01", category: "Furniture", sales: 31301 },
  { date: "2017-03-01", category: "Office Supplies", sales: 28874 },
  { date: "2017-03-01", category: "Technology", sales: 25230 },
  { date: "2017-06-01", category: "Furniture", sales: 41683 },
  { date: "2017-06-01", category: "Office Supplies", sales: 32169 },
  { date: "2017-06-01", category: "Technology", sales: 44406 },
  { date: "2017-09-01", category: "Furniture", sales: 39416 },
  { date: "2017-09-01", category: "Office Supplies", sales: 48872 },
  { date: "2017-09-01", category: "Technology", sales: 47540 },
  { date: "2017-12-01", category: "Furniture", sales: 71471 },
  { date: "2017-12-01", category: "Office Supplies", sales: 67254 },
  { date: "2017-12-01", category: "Technology", sales: 87038 },
  { date: "2018-03-01", category: "Furniture", sales: 25032 },
  { date: "2018-03-01", category: "Office Supplies", sales: 26332 },
  { date: "2018-03-01", category: "Technology", sales: 49207 },
  { date: "2018-06-01", category: "Furniture", sales: 40282 },
  { date: "2018-06-01", category: "Office Supplies", sales: 54781 },
  { date: "2018-06-01", category: "Technology", sales: 53644 },
  { date: "2018-09-01", category: "Furniture", sales: 51247 },
  { date: "2018-09-01", category: "Office Supplies", sales: 55562 },
  { date: "2018-09-01", category: "Technology", sales: 56646 },
  { date: "2018-12-01", category: "Furniture", sales: 92905 },
  { date: "2018-12-01", category: "Office Supplies", sales: 85371 },
  { date: "2018-12-01", category: "Technology", sales: 109679 },
];

// The US federal surplus (+) or deficit (-) per month, 2017 to 2018, in
// millions of dollars (US Treasury, Monthly Treasury Statement; the
// benchmark's `budget-balance.json`). Public domain.
const budgetBalance = [
  { date: "2017-01-01", balance: 51257 },
  { date: "2017-02-01", balance: -192044 },
  { date: "2017-03-01", balance: -176233 },
  { date: "2017-04-01", balance: 182428 },
  { date: "2017-05-01", balance: -88423 },
  { date: "2017-06-01", balance: -90233 },
  { date: "2017-07-01", balance: -42939 },
  { date: "2017-08-01", balance: -107689 },
  { date: "2017-09-01", balance: 7886 },
  { date: "2017-10-01", balance: -63214 },
  { date: "2017-11-01", balance: -138547 },
  { date: "2017-12-01", balance: -23192 },
  { date: "2018-01-01", balance: 49237 },
  { date: "2018-02-01", balance: -215239 },
  { date: "2018-03-01", balance: -208744 },
  { date: "2018-04-01", balance: 214255 },
  { date: "2018-05-01", balance: -146796 },
  { date: "2018-06-01", balance: -74858 },
  { date: "2018-07-01", balance: -76865 },
  { date: "2018-08-01", balance: -214148 },
  { date: "2018-09-01", balance: 119116 },
  { date: "2018-10-01", balance: -100491 },
  { date: "2018-11-01", balance: -204903 },
  { date: "2018-12-01", balance: -13539 },
];

export const StackedArea: StoryObj<Args> = {
  args: { w: 520, h: 330 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Area over Time",
      description:
        "Quarterly sales of three product categories stacked as areas on a time axis, from 2016 to 2018.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(quarterlySales, { schema: { date: Schema.time() }, axes: true })
      .flow(
        scatter({ by: "date", x: "date" }),
        stack({ by: "category", dir: "y" })
      )
      .mark(ribbon({ h: "sales", fill: "category", curve: Curve.linear() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const CircleTimeline: StoryObj<Args> = {
  args: { w: 440, h: 240 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Circle Timeline",
      description:
        "Quarterly sales as circles along a time axis, one row per product category, with each circle's area proportional to its sales.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const maxSales = Math.max(...quarterlySales.map((d) => d.sales));
    // Area proportional to sales, the largest 18 px in radius.
    const rows = quarterlySales.map((d) => ({
      ...d,
      radius: 18 * Math.sqrt(d.sales / maxSales),
    }));
    // A data-driven `r` would be a size in data units, scaled with the axes,
    // so each circle gets a literal pixel `r`.
    chart(rows, { schema: { date: Schema.time() }, axes: true })
      .flow(
        spread({ by: "category", dir: "y", spacing: 60 }),
        scatter({ by: "date", x: "date", alignment: "middle" })
      )
      .mark((d: any) =>
        circle({ r: d[0].radius, fill: "category", opacity: 0.8 })(d)
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const SurplusDeficitLine: StoryObj<Args> = {
  args: { w: 560, h: 340 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Surplus and Deficit Line",
      description:
        "The US federal budget balance month by month in 2017 and 2018, filled green above zero and orange below it, on a time axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    // Dates as epoch milliseconds, so a crossing can be placed between two
    // months by interpolating the time.
    const rows = budgetBalance.map((d) => ({
      date: Date.parse(d.date),
      balance: d.balance,
    }));
    // Add a zero point at each crossing, so each side's area ends there.
    const pts: { date: number; balance: number }[] = [];
    rows.forEach((d, i) => {
      const prev = rows[i - 1];
      if (prev && prev.balance * d.balance < 0) {
        const f = prev.balance / (prev.balance - d.balance);
        pts.push({ date: prev.date + f * (d.date - prev.date), balance: 0 });
      }
      pts.push(d);
    });
    // Each side's area is the balance clamped to that side of zero.
    const area = pts.flatMap((d) => [
      { date: d.date, side: "Surplus", balance: Math.max(d.balance, 0) },
      { date: d.date, side: "Deficit", balance: Math.min(d.balance, 0) },
    ]);
    const schema = { date: Schema.time() };
    chart(area, {
      schema,
      axes: true,
      color: Color.palette({ Surplus: "#2a9d8f", Deficit: "#e76f51" }),
    })
      .flow(group({ by: "side" }), scatter({ by: "date", x: "date" }))
      .mark(ribbon({ h: "balance", fill: "side", curve: Curve.linear() }))
      // The line: invisible anchors at the monthly values, then a line
      // through them.
      .layer(
        chart(rows, { schema })
          .flow(scatter({ by: "date", x: "date", y: "balance" }))
          .mark(blank())
      )
      .layer(line({ stroke: "#222", strokeWidth: 1.5, curve: Curve.linear() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
