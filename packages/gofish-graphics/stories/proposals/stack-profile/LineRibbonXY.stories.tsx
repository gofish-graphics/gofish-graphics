import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import data from "vega-datasets";
import {
  chart,
  field,
  group,
  rect,
  spread,
  line,
  Place,
  ribbon,
  scatter,
  stack,
  Tile,
  treemap,
  Unit,
} from "../../../src/lib";
import { drivingShifts } from "../../../src/data/drivingShifts";
import { streamgraphData } from "../../../src/data/streamgraphData";
import { seafood } from "../../../src/data/catch";

/**
 * THROWAWAY prototype stories for the croissant-sampling proposal (#1332),
 * line and ribbon section (round 7). Two sugars, each one written rewrite:
 *
 *   .mark(R({ x, y, along, ...rest }))
 *     ==> .flow(..., scatter({ by: along ?? x, x, y })).mark(R(rest))
 *   .mark(R(...).stack(s))
 *     ==> the same, with stack(s) as the last flow step (inside the slices)
 *
 * The flow `stack` stays local: it stacks whole children, so a stack of
 * whole ribbons whose height varies is an error. `xy(ops, pos, s)` builds
 * the rewritten flow, so each story draws the proposed spelling.
 * `StackOuterToday` and `StackOuterBarsToday` show what today's engine draws
 * for the specs that become errors.
 */
const meta: Meta = { title: "Proposals/Stack Profile/Line Ribbon XY" };
export default meta;

const xy = (
  ops: any[],
  pos: { x: string; y?: string; along?: string },
  s?: Parameters<typeof stack>[0]
) => [
  ...ops,
  scatter({ by: pos.along ?? pos.x, x: pos.x, ...(pos.y ? { y: pos.y } : {}) }),
  ...(s ? [stack(s)] : []),
];

// line({ x: "year", y: "gas" })
export const Line: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(drivingShifts, { w: 480, h: 260 })
      .flow(...xy([], { x: "year", y: "gas" }))
      .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
      .render(container);
    return container;
  },
};

// The same yearly averages as LabelPlacement/LineEndLabels.
const yearlyStocks = async () => {
  const rows = (await data["stocks.csv"]()) as any[];
  const acc = new Map<string, { symbol: string; date: string; sum: number; n: number }>();
  for (const d of rows) {
    const year = new Date(d.date).getFullYear();
    const key = `${d.symbol}${year}`;
    const e = acc.get(key) ?? { symbol: d.symbol, date: `${year}-07-01`, sum: 0, n: 0 };
    e.sum += +d.price;
    e.n += 1;
    acc.set(key, e);
  }
  return [...acc.values()].map((e) => ({
    symbol: e.symbol,
    date: e.date,
    price: Math.round((e.sum / e.n) * 100) / 100,
  }));
};

// .flow(group({ by: "symbol" })).mark(line({ x: "date", y: "price", stroke: "symbol" }))
export const MultiLine: StoryObj = {
  loaders: [async () => ({ stocks: await yearlyStocks() })],
  render: (_args: unknown, context: any) => {
    const container = initializeContainer();
    chart(context.loaded.stocks, { schema: { date: Unit.time() }, w: 560, h: 320 })
      .flow(...xy([group({ by: "symbol" })], { x: "date", y: "price" }))
      .mark(
        line({ stroke: "symbol", strokeWidth: 2 }).label("symbol", {
          position: Place.end(),
        })
      )
      .render(container, { axes: true, legend: false });
    return container;
  },
};

const one = streamgraphData.filter((d) => d.c === 0);

// ribbon({ x: "x", h: "y" })
export const Area: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(one, { w: 480, h: 220 })
      .flow(...xy([], { x: "x" }))
      .mark(ribbon({ h: "y", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// .flow(stack({ by: "c", dir: "y" })).mark(ribbon({ x: "x", h: "y", fill: "c" }))
// read pointwise: the stack goes inside each x slice
export const StackedArea: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: 480, h: 260 })
      .flow(...xy([], { x: "x" }, { by: "c", dir: "y" }))
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// TODAY: the stack written first, as today's engine reads it (a box stack).
// Each series is one box as tall as its peak, so the series sit in bands.
// Under the pointwise reading this spelling draws StackedArea instead.
export const StackOuterToday: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: 480, h: 260 })
      .flow(stack({ by: "c", dir: "y" }), scatter({ by: "x", x: "x" }))
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// TODAY: bars with the stack written before the spread. Today's box stack
// puts each species' whole row of bars on top of the last.
export const StackOuterBarsToday: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 480, h: 260 })
      .flow(
        stack({ by: "species", dir: "y" }),
        spread({ by: "lake", dir: "x", spacing: 16 })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(container);
    return container;
  },
};

// The same bars read pointwise: the stack goes inside each lake, which is
// today's stacked bar chart (spread, then stack).
export const StackOuterBarsPointwise: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 480, h: 260 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 16 }),
        stack({ by: "species", dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(container);
    return container;
  },
};

// .flow(spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }))
// .mark(ribbon({ h: "count", fill: "species" }).stack({ by: "species", dir: "y" }))
// The streamgraph: the lakes are a spread (no data x), so `.stack()` goes
// right after it. The rewrite is today's gallery Streamgraph.
export const StreamLakes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 480, h: 260 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }),
        stack({ by: "species", dir: "y" })
      )
      .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// line({ x: "x", y: "y", stroke: "c" }).stack({ by: "c", dir: "y" })
// Stacked lines: each line runs along the top of its slot.
export const StackedLines: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: 480, h: 260 })
      .flow(...xy([], { x: "x" }, { by: "c", dir: "y" }))
      .mark(
        line({
          h: "y",
          stroke: "c",
          strokeWidth: 2,
          source: { y: "end" },
          target: { y: "end" },
        })
      )
      .render(container);
    return container;
  },
};

// What rect({ x, y }) with data fields does today, with no flow.
export const RectXYToday: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(drivingShifts, { w: 480, h: 260 })
      .mark(rect({ x: "year", y: "gas", w: 6, h: 6, fill: "steelblue" }))
      .render(container);
    return container;
  },
};

// A ridgeline is a spread: each series keeps its own baseline, and the
// ridges overlap because each row is taller than the pitch. Same pattern as
// the gallery Ridgeline Chart (spread with anchor "baseline").
//   .flow(spread({ by: "c", dir: "y", anchor: "baseline", spacing: 36 }))
//   .mark(ribbon({ x: "x", h: "y", fill: "c" }))
export const Ridgeline: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: 480, axes: { x: true, y: false } })
      .flow(
        spread({
          by: field("c").sort([4, 3, 2, 1, 0]),
          dir: "y",
          anchor: "baseline",
          spacing: 36,
        }),
        scatter({ by: "x", x: "x", h: 80 })
      )
      .mark(
        ribbon({ h: "y", fill: "c", stroke: "white", strokeWidth: 1, opacity: 0.9 })
      )
      .render(container);
    return container;
  },
};

// "What is stack?": a box divided by weights, two ways. stack with `size`
// (the gallery Mosaic Chart's spelling) ...
export const MosaicStack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 360, h: 260 })
      .flow(
        stack({ by: "lake", dir: "x", size: "count" }),
        stack({ by: "species", dir: "y", size: field("count").normalize() })
      )
      .mark(rect({ fill: "species", stroke: "white", strokeWidth: 2 }))
      .render(container);
    return container;
  },
};

// ... and treemap with Tile.dice then Tile.slice.
export const MosaicTreemap: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 360, h: 260 })
      .flow(
        treemap({ by: "lake", size: "count", tile: Tile.dice }),
        treemap({ by: "species", size: "count", tile: Tile.slice })
      )
      .mark(rect({ fill: "species", stroke: "white", strokeWidth: 2 }))
      .render(container);
    return container;
  },
};

// 100% bars with today's cut: each lake's rect is divided by species weight.
// cut is an expand mark: it returns one slice per row, and the flow's last
// tier (stack) lays the slices out.
export const HundredCut: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 480, h: 260 })
      .flow(spread({ by: "lake", dir: "x", spacing: 16 }), stack({ dir: "y" }))
      .mark(
        rect({ w: 40, h: 200, fill: "species" }).cut({ dir: "y", size: "count" })
      )
      .render(container);
    return container;
  },
};
