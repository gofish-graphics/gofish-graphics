// Example 2: reference rule and band. Seattle's mean daily high per month,
// with a rule at the mean of all months, labeled at its right end, and a
// shaded band over the summer of 2015, labeled at its top.
import type { Meta, StoryObj } from "@storybook/html";
import { meanBy } from "lodash";
import { initializeContainer } from "../../helper";
import {
  chart,
  datum,
  derive,
  line,
  project,
  rect,
  scatter,
  Unit,
} from "../../../src/lib";
import { seattleMonthly as seattle } from "./data";
import { band, rule } from "./helpers";

const meta: Meta = { title: "Proposals/Annotations/Ex2 Rule and Band" };
export default meta;

const mean = Math.round(meanBy(seattle, "temp") * 10) / 10;

// ─── A: today's primitives ───────────────────────────────────────────────────
export const A: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    const start = Date.parse("2015-06-01");
    const end = Date.parse("2015-09-01");
    chart(seattle, { schema: { date: Unit.time() }, w: 560, h: 280 })
      .flow(scatter({ by: "date", x: "date", y: "temp" }))
      .mark(line({ stroke: "#467DA8", strokeWidth: 2 }))
      .layer(
        rect({
          x: datum(start),
          w: datum(end - start),
          fill: "#f2b45c",
          opacity: 0.3,
        })
          .label(() => "summer 2015", { position: "outset-top", fontSize: 11 })
          .zOrder(-1)
      )
      .layer(
        rect({ y: datum(mean), h: 1, fill: "#555" }).label(
          () => `mean ${mean}`,
          { position: "outset-right", fontSize: 11 }
        )
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// The rule's value computed inside the chart (Vega-Lite's `y: mean(temp)`)
// instead of before it: a second chart over the same rows, derived to one row.
export const AInChartMean: StoryObj = {
  name: "A (mean computed in chart)",
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    chart(seattle, { schema: { date: Unit.time() }, w: 560, h: 280 })
      .flow(scatter({ by: "date", x: "date", y: "temp" }))
      .mark(line({ stroke: "#467DA8", strokeWidth: 2 }))
      .layer(
        chart(seattle)
          .flow(derive((rows) => [{ mean: meanBy(rows, "temp") }]))
          .mark(
            rect({ y: "mean", h: 1, fill: "#555" }).label(
              (d) => `mean ${project(d, "mean").toFixed(1)}`,
              { position: "outset-right", fontSize: 11 }
            )
          )
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── B: shorthands (helpers.ts) ──────────────────────────────────────────────
export const B: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    chart(seattle, { schema: { date: Unit.time() }, w: 560, h: 280 })
      .flow(scatter({ by: "date", x: "date", y: "temp" }))
      .mark(line({ stroke: "#467DA8", strokeWidth: 2 }))
      .layer(
        band({ x: ["2015-06-01", "2015-09-01"], opacity: 0.3 })
          .label(() => "summer 2015", { position: "outset-top", fontSize: 11 })
          .zOrder(-1)
      )
      .layer(
        rule({ y: mean, stroke: "#555" }).label(() => `mean ${mean}`, {
          position: "outset-right",
          fontSize: 11,
        })
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};
