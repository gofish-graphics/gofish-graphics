import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, rect, field } from "../../src/lib";

const meta: Meta = {
  title: "Tests/Field Expression Pipeline",
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

// Deliberately out-of-alphabetical order (C, A, B) so a correct
// `field("x").sort("v")` visibly reorders the bars ascending by `v`.
const sortData = [
  { x: "C", v: 40 },
  { x: "A", v: 10 },
  { x: "B", v: 25 },
];

export const SortByValue: StoryObj<Args> = {
  args: { w: 400, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // field("x").sort("v") should order the bars ascending by `v`:
    // A (10), B (25), C (40) — left to right.
    chart(sortData, { axes: true })
      .flow(spread({ by: field("x").sort("v"), dir: "x", spacing: 20 }))
      .mark(rect({ w: 40, h: "v", fill: "x" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

const binData = Array.from({ length: 60 }, (_, i) => ({
  age: (i * 37) % 100, // spread pseudo-randomly across 0-99
}));

export const BinnedSpread: StoryObj<Args> = {
  args: { w: 500, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // field("age").bin() groups rows into ~10 numeric bins and spreads one
    // bar per bin, each sized by the bin's row count — a histogram.
    chart(binData, { axes: true })
      .flow(spread({ by: field("age").bin(), dir: "x", spacing: 4 }))
      .mark(rect({ w: 30, h: field("age").count() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

const meanData = [
  { species: "Bass", weight: 2 },
  { species: "Bass", weight: 4 },
  { species: "Trout", weight: 1 },
  { species: "Trout", weight: 3 },
  { species: "Trout", weight: 5 },
];

export const MeanAggregate: StoryObj<Args> = {
  args: { w: 300, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // field("weight").mean() overrides the default sum aggregate: Bass -> 3,
    // Trout -> 3 (both bars should render the SAME height, not 6 vs 9).
    chart(meanData, { axes: true })
      .flow(spread({ by: "species", dir: "x", spacing: 20 }))
      .mark(rect({ w: 60, h: field("weight").mean(), fill: "species" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
