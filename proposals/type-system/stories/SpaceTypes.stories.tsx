import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  stack,
  treemap,
  rect,
  field,
  Unit,
  Trait,
  Domain,
  Tile,
  Color,
} from "../../src/lib";

// Probes for proposals/type-system/research/space-types-check.md. Each story
// draws what GoFish draws TODAY for one of the "examples to explore" in the
// 2026-11-13 space-type notes. Small synthetic data.

const meta: Meta = { title: "Probe/Space Types" };
export default meta;

const showError = (container: HTMLElement) => (err: unknown) => {
  const box = document.createElement("pre");
  box.style.cssText =
    "width: 380px; box-sizing: border-box; margin: 0; padding: 12px; white-space: pre-wrap; " +
    "font: 12px/1.4 monospace; color: #8a1c1c; background: #fdecec; border: 1px solid #e3a0a0;";
  box.textContent =
    "ERROR: " + (err instanceof Error ? err.message : String(err));
  container.replaceChildren(box);
};

const cars = [
  { origin: "Europe", cylinders: "4", count: 66 },
  { origin: "Europe", cylinders: "5", count: 3 },
  { origin: "Europe", cylinders: "6", count: 4 },
  { origin: "Japan", cylinders: "3", count: 4 },
  { origin: "Japan", cylinders: "4", count: 69 },
  { origin: "Japan", cylinders: "6", count: 6 },
  { origin: "USA", cylinders: "4", count: 72 },
  { origin: "USA", cylinders: "6", count: 74 },
  { origin: "USA", cylinders: "8", count: 108 },
];

// Example 1: the mosaic as written today (a stack of stacks, inner sizes are
// shares).
export const MosaicStackOfStacks: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(cars, { w: 320, h: 320 })
      .flow(
        stack({ by: "origin", dir: "x", size: "count" }),
        stack({ by: "cylinders", dir: "y", size: field("count").normalize() })
      )
      .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// Example 1: the same stack of stacks with raw counts on both axes. Widths
// and heights are both counts, so a cell's area is count x count.
export const MosaicRawCounts: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(cars, { w: 320, h: 320 })
      .flow(
        stack({ by: "origin", dir: "x", size: "count" }),
        stack({ by: "cylinders", dir: "y" })
      )
      .mark(
        rect({ h: "count", fill: "origin", stroke: "white", strokeWidth: 2 })
      )
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// Example 2: a mosaic from two one-level treemaps (dice, then slice). Both
// sizes are raw counts.
export const MosaicTreemaps: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(cars, { w: 320, h: 320, axes: false })
      .flow(
        treemap({
          by: "origin",
          size: "count",
          tile: Tile.dice(),
          sort: "none",
        }),
        treemap({
          by: "cylinders",
          size: "count",
          tile: Tile.slice(),
          sort: "none",
        })
      )
      .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// Example 3: nested squarified treemaps.
export const SquarifyNested: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(cars, { w: 320, h: 320, axes: false })
      .flow(
        treemap({ by: "origin", size: "count" }),
        treemap({ by: "cylinders", size: "count" })
      )
      .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// Example 3 (metamorphic test): the same treemap with its rows reversed.
const carsReversed = [...cars].reverse();
const squarify =
  (rows: typeof cars, sort: "desc" | "none"): StoryObj["render"] =>
  () => {
    const container = initializeContainer();
    chart(rows, { w: 320, h: 200, axes: false })
      .flow(treemap({ by: "cylinders", size: "count", sort }))
      .mark(rect({ fill: "cylinders" }))
      .render(container)
      .catch(showError(container));
    return container;
  };
export const PermuteSortDescA: StoryObj = { render: squarify(cars, "desc") };
export const PermuteSortDescB: StoryObj = {
  render: squarify(carsReversed, "desc"),
};
export const PermuteSortNoneA: StoryObj = { render: squarify(cars, "none") };
export const PermuteSortNoneB: StoryObj = {
  render: squarify(carsReversed, "none"),
};

// Example 4: stacked means. USD is declared summable, so the unit check
// passes, and the bar adds three monthly mean prices.
const MONTHS = ["Jan", "Feb", "Mar", "Apr"];
const WAREHOUSES = ["North", "South", "West"];
const sales = MONTHS.flatMap((month, m) =>
  WAREHOUSES.flatMap((warehouse, w) =>
    [0, 1].map((k) => ({
      month,
      warehouse,
      price: 9 + m * 0.5 + w + k * 0.4,
    }))
  )
);
export const StackedMeans: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(sales, {
      w: 320,
      h: 220,
      schema: { price: { unit: Unit("USD", { traits: [Trait.summable()] }) } },
    })
      .flow(
        spread({ by: "month", dir: "x" }),
        stack({ by: "warehouse", dir: "y" })
      )
      .mark(rect({ h: field("price").mean(), fill: "warehouse" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};

// Example 6: one diverging stack and one linear stack under one shared x
// axis. A spread along y lines its children up on x (a shared baseline), as
// the Likert story's rows are.
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];
const likert = [12, 22, 38, 86, 42].map((count, i) => ({
  response: LEVELS[i],
  count,
}));
const channels = (signed: boolean) =>
  [
    ["Email", 40],
    ["Forum", 25],
    ["Chat", signed ? -30 : 30],
  ].map(([channel, count]) => ({ channel, count }));
const likertColors = Color.palette({
  "Strongly disagree": "#ca0020",
  Disagree: "#f4a582",
  Neutral: "#d9d9d9",
  Agree: "#92c5de",
  "Strongly agree": "#0571b0",
  Email: "#666",
  Forum: "#999",
  Chat: "#bbb",
});
const mixed =
  (signed: boolean): StoryObj["render"] =>
  () => {
    const container = initializeContainer();
    const rows = [
      ...likert.map((r) => ({ panel: "Survey", ...r, channel: undefined })),
      ...channels(signed).map((r) => ({
        panel: "Contacts",
        ...r,
        response: undefined,
      })),
    ];
    const schema = {
      response: Unit({
        domain: Domain.discrete(LEVELS),
        traits: [Trait.diverging()],
      }),
    };
    spread({ dir: "y", spacing: 24 }, [
      chart(
        rows.filter((r) => r.panel === "Survey"),
        { schema }
      )
        .flow(stack({ by: "response", dir: "x" }))
        .mark(rect({ w: "count", h: 30, fill: "response" })),
      chart(rows.filter((r) => r.panel === "Contacts"))
        .flow(stack({ by: "channel", dir: "x" }))
        .mark(rect({ w: "count", h: 30, fill: "channel" })),
    ])
      .render(container, { w: 420, h: 140, axes: true, color: likertColors })
      .catch(showError(container));
    return container;
  };
export const DivergingAndLinear: StoryObj = { render: mixed(false) };
export const DivergingAndSigned: StoryObj = { render: mixed(true) };

// Example 6, in one chart: the Likert rows alone, for comparison.
export const DivergingAlone: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(likert, {
      w: 420,
      h: 60,
      color: likertColors,
      schema: {
        response: Unit({
          domain: Domain.discrete(LEVELS),
          traits: [Trait.diverging()],
        }),
      },
    })
      .flow(stack({ by: "response", dir: "x" }))
      .mark(rect({ w: "count", h: 30, fill: "response" }))
      .render(container)
      .catch(showError(container));
    return container;
  },
};
