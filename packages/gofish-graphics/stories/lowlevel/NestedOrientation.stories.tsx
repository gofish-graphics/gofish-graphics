import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { spreadX, stackX, layer, rect, polar, For, v } from "../../src/lib";
import { color6 } from "../../src/color";

const meta: Meta = {
  title: "Low Level Syntax/Nested Orientation",
};
export default meta;

// Small multiples of mini bar charts: the OUTER spread and every INNER mini
// chart both carry a continuous y. y-up nests idempotently (#629) — the inner
// charts inherit the outer scope's flip rather than mirroring a second time, so
// every mini chart grows UPWARD. A double flip would render them upside down.
const groups = [
  { name: "Q1", bars: [30, 55, 40] },
  { name: "Q2", bars: [70, 45, 90] },
  { name: "Q3", bars: [50, 80, 35] },
  { name: "Q4", bars: [95, 60, 75] },
];

const miniChart = (bars: number[], key: string) =>
  spreadX(
    { key, spacing: 4, alignment: "start", h: 160 },
    For(bars, (b, i) =>
      rect({ key: `${key}-${i}`, w: 12, h: v(b), fill: color6[i as number] })
    )
  );

// Regression repro (#629): not gallery-tagged — a test-like orientation check.
export const NestedCharts: StoryObj = {
  render: () => {
    const container = initializeContainer();
    spreadX(
      { spacing: 40, alignment: "start" },
      For(groups, (g) => miniChart(g.bars, g.name))
    ).render(container, { axes: true });
    return container;
  },
};

// A polar pie sitting beside a continuous-y bar chart in one free-space canvas.
// The bar chart declares y-up and grows upward; the `coord` pie sets its OWN
// convention absolutely and CANCELS the incoming orientation (#629), so the
// wedges keep the same clockwise-from-top sense they have as a standalone pie —
// a parent's orientation places the pie's box, it never re-interprets its
// interior.
const pieData = [
  { label: "A", count: 30, color: color6[0] },
  { label: "B", count: 20, color: color6[1] },
  { label: "C", count: 25, color: color6[2] },
  { label: "D", count: 15, color: color6[3] },
  { label: "E", count: 10, color: color6[4] },
];

const pie = () =>
  layer({ coord: polar() }, [
    stackX(
      { h: 70, spacing: 0, alignment: "start", sharedScale: true },
      For(pieData, (d) => rect({ w: v(d.count), fill: d.color }))
    ),
  ]);

const barsBeside = () =>
  spreadX(
    { spacing: 8, alignment: "start", h: 160 },
    For([40, 90, 60, 80], (b, i) =>
      rect({ key: `b${i}`, w: 18, h: v(b), fill: color6[0] })
    )
  );

// Regression repro (#629): not gallery-tagged — a test-like orientation check.
export const PolarInChart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    spreadX({ spacing: 80, alignment: "middle" }, [barsBeside(), pie()]).render(
      container,
      {}
    );
    return container;
  },
};
