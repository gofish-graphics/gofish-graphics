import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import data from "vega-datasets";
import {
  chart,
  group,
  line,
  Place,
  ribbon,
  scatter,
  stack,
  Unit,
} from "../../src/lib";
import { drivingShifts } from "../../src/data/drivingShifts";
import { streamgraphData } from "../../src/data/streamgraphData";

/**
 * THROWAWAY prototype stories for the croissant-sampling proposal (#1332),
 * line and ribbon section. The proposal lets `line` and `ribbon` take their
 * position channels (`x`, `y`, `along`) and a `.stack(...)` after the mark.
 * Both are sugar for one rewrite:
 *
 *   .flow(...ops).mark(R({ x, y, along, ...rest }).stack(s))
 *     ==> .flow(...ops, scatter({ by: along ?? x, x, y }), stack(s)).mark(R(rest))
 *
 * `xy(ops, pos, s)` does that rewrite by hand, so each story runs the spelling
 * the engine would see. The proposed user code is in the proposal page.
 */
const meta: Meta = { title: "Proposals/Line Ribbon XY" };
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

// ribbon({ x: "x", h: "y", fill: "c" }).stack({ by: "c", dir: "y" })
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

// .flow(stack({ by: "c", dir: "y" })).mark(ribbon({ x: "x", h: "y", fill: "c" }))
// The stack is outside the x tier, so it stacks whole ribbons by their boxes.
export const StackBeforeMark: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: 480, h: 260 })
      .flow(...xy([stack({ by: "c", dir: "y" })], { x: "x" }))
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};
