import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, stack, rect, ribbon, field } from "../../src/lib";

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

// Deliberately in a data order that disagrees with both alphabetical and
// the explicit order list below, so a correct `field("x").sort([...])`
// visibly reorders the bars.
const explicitOrderData = [
  { x: "rain", v: 10 },
  { x: "sun", v: 40 },
  { x: "extra", v: 5 },
  { x: "snow", v: 15 },
  { x: "fog", v: 25 },
  { x: "drizzle", v: 30 },
];

export const SortByExplicitOrder: StoryObj<Args> = {
  args: { w: 500, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // field("x").sort([...]) (#735) orders bars by an explicit list, not an
    // aggregate: sun, fog, drizzle, rain, snow — left to right. "extra"
    // isn't in the list, so it's appended after (natural sort order).
    chart(explicitOrderData, { axes: true })
      .flow(
        spread({
          by: field("x").sort(["sun", "fog", "drizzle", "rain", "snow"]),
          dir: "x",
          spacing: 20,
        })
      )
      .mark(rect({ w: 40, h: "v", fill: "x" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// One row has a null `x` (category) — a real-world "unlabeled"/missing-field
// row that should be dropped rather than grouped into its own "null" bar.
const dropNullsData = [
  { x: "A", v: 10 },
  { x: null, v: 999 },
  { x: "B", v: 25 },
  { x: undefined, v: 999 },
  { x: "C", v: 40 },
];

export const DropNulls: StoryObj<Args> = {
  args: { w: 400, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // field("x").dropNulls() removes the null/undefined-`x` rows BEFORE
    // grouping: exactly 3 bars (A, B, C), each at its own `v` — no fourth
    // "null" bar and no distortion from the two 999-valued rows.
    chart(dropNullsData, { axes: true })
      .flow(spread({ by: field("x").dropNulls(), dir: "x", spacing: 20 }))
      .mark(rect({ w: 40, h: "v", fill: "x" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const BinnedRibbonHistogram: StoryObj<Args> = {
  args: { w: 500, h: 250 },
  render: (args: Args) => {
    const container = initializeContainer();
    // Same binning as BinnedSpread, but with `ribbon(...)` instead of
    // `rect(...)`: a relational mark's anchor-tier `h` now accepts a
    // `field(...)` pipeline the same way a leaf mark's "size" channel does.
    // `ribbon({h: field("age").count()})` placed directly in `.mark()`
    // position blank-fuses to `.mark(blank({h: field("age").count()}))` +
    // `.layer(ribbon({}))` (see `createRelationalMark`'s
    // `tagRelationalFusable`) — the anchor blank evaluates the expression
    // per bin, and the connector bands the resulting bin-tops into an area
    // histogram. Bins with zero rows are dropped rather than rendered as
    // zero-height gaps, so the band visibly skips them — see #763.
    chart(binData, { axes: true })
      .flow(spread({ by: field("age").bin(), dir: "x", spacing: 0 }))
      .mark(ribbon({ w: 30, h: field("age").count(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
