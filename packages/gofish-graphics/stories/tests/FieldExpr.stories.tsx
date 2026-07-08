import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, stack, rect, field } from "../../src/lib";

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

const shareData = [
  { category: "a", part: "x", n: 1 },
  { category: "a", part: "y", n: 3 },
  { category: "b", part: "x", n: 2 },
  { category: "b", part: "y", n: 2 },
];

export const NormalizeSizeStack: StoryObj<Args> = {
  args: { w: 300, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // stack's `size: field("n").normalize()` (#700 Phase 2) replaces each
    // entry's raw `n` with its SHARE of the column: category "a" is 1/4 x,
    // 3/4 y; category "b" is 1/2 x, 1/2 y. Every bar reaches the same
    // full-height 1 (a percent-bar), unlike the raw-count MosaicChart story.
    chart(shareData, { axes: true })
      .flow(
        spread({ by: "category", dir: "x", spacing: 20 }),
        stack({ by: "part", dir: "y", size: field("n").normalize() })
      )
      .mark(rect({ w: 60, fill: "part" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

const spreadSizeData = [
  { lake: "Huron", fish: 12 },
  { lake: "Erie", fish: 30 },
  { lake: "Ontario", fish: 18 },
];

export const SpreadSizeOrdinalAxis: StoryObj<Args> = {
  args: { w: 400, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // `spread({ by, size })` wraps each child in a sized layer (#700 Phase
    // 2). Regression check: the wrapper must copy the split identity (key/
    // datum/__splitBy) onto itself, or the legend/fill-by-category loses its
    // per-bar identity (all three bars would render the SAME color instead
    // of Huron/Erie/Ontario each keeping their own). Bar widths are also
    // proportional to `fish` (12/30/18).
    chart(spreadSizeData, { axes: true })
      .flow(spread({ by: "lake", dir: "x", spacing: 20, size: "fish" }))
      .mark(rect({ h: 40, fill: "lake" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
