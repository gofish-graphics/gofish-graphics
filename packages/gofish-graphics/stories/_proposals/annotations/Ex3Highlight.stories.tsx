// Example 3: highlight one series (gghighlight). Five stocks' yearly average
// price; AAPL in color, drawn on top of the gray others, and named at its end.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  Color,
  group,
  line,
  Place,
  project,
  scatter,
  Unit,
} from "../../../src/lib";
import { yearlyStocks } from "./data";
import { emphasize } from "./helpers";

const meta: Meta = { title: "Proposals/Annotations/Ex3 Highlight Series" };
export default meta;

// ─── A: today's primitives ───────────────────────────────────────────────────
export const A: StoryObj = {
  loaders: [async () => ({ stocks: await yearlyStocks() })],
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const stocks = ctx.loaded.stocks;
    // ── spec ──
    const isAAPL = (d: any) => project(d, "symbol") === "AAPL";
    chart(stocks, {
      schema: { date: Unit.time() },
      w: 560,
      h: 300,
      color: Color.palette({ AAPL: "#d62728" }), // unmapped series fall to gray
    })
      .flow(
        group({ by: "symbol" }),
        scatter({ by: "date", x: "date", y: "price" })
      )
      .mark(
        line({ stroke: "symbol", strokeWidth: 2 })
          .zOrder((d) => (isAAPL(d) ? 1 : 0))
          .label((d) => (isAAPL(d) ? "AAPL" : ""), { position: Place.end() })
      )
      .render(container, { axes: true, legend: false });
    // ── end spec ──
    return container;
  },
};

// ─── B: shorthands (helpers.ts) ──────────────────────────────────────────────
export const B: StoryObj = {
  loaders: [async () => ({ stocks: await yearlyStocks() })],
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const stocks = ctx.loaded.stocks;
    // ── spec ──
    const hi = emphasize(
      "symbol",
      { AAPL: "#d62728" },
      ["color", "z", "label"],
      {
        position: Place.end(),
      }
    );
    chart(stocks, {
      schema: { date: Unit.time() },
      w: 560,
      h: 300,
      ...hi.chart,
    })
      .flow(
        group({ by: "symbol" }),
        scatter({ by: "date", x: "date", y: "price" })
      )
      .mark(hi.mark(line({ stroke: "symbol", strokeWidth: 2 })))
      .render(container, { axes: true, legend: false });
    // ── end spec ──
    return container;
  },
};
