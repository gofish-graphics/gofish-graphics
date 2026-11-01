// Example 1: peak callout (d3-annotation's canonical case). GOOG's monthly
// price, with a circle around the highest month and a two-line note up and
// to the left, joined to the circle by a leader.
import type { Meta, StoryObj } from "@storybook/html";
import { maxBy } from "lodash";
import { initializeContainer } from "../../helper";
import {
  arrow,
  blank,
  chart,
  Constraint,
  derive,
  enclose,
  layer,
  line,
  project,
  scatter,
  selectAll,
  Shape,
  spread,
  text,
  Unit,
} from "../../../src/lib";
import { googMonthly, monthYear } from "./data";
import { argmax, callout } from "./helpers";

const meta: Meta = { title: "Proposals/Annotations/Ex1 Peak Callout" };
export default meta;

const RED = "#c0392b";

// ─── A: today's primitives ───────────────────────────────────────────────────
export const A: StoryObj = {
  loaders: [async () => ({ goog: await googMonthly() })],
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // The note's words read the peak row. The circle's target does not: it is
    // picked inside the chart, by the derive over the selection.
    const peak = maxBy(goog, "price") as any;
    // ── spec ──
    layer([
      chart(goog, { schema: { date: Unit.time() }, w: 560, h: 300 })
        .flow(scatter({ by: "date", x: "date", y: "price" }))
        .mark(blank().name("months"))
        .layer(line({ stroke: "#467DA8", strokeWidth: 2 }))
        .layer(
          chart(selectAll("months"))
            .flow(derive((ms) => [maxBy(ms, (m) => project(m, "price"))]))
            .mark(
              enclose({
                shape: Shape.oval(),
                padding: 6,
                fill: "none",
                stroke: RED,
                strokeWidth: 1.5,
              }).name("peak")
            )
        ),
      spread({ dir: "y", spacing: 2, alignment: "start" }, [
        text({ text: "Peak", fontSize: 13, fontWeight: 700 }),
        text({ text: `$${peak.price} in ${monthYear(peak.date)}` }),
      ]).name("note"),
    ])
      .relate(({ peak, note }) => [
        Constraint.distribute({ dir: "x", spacing: 40 }, [note, peak]),
        Constraint.distribute({ dir: "y", spacing: 30 }, [peak, note]),
        arrow(
          {
            bow: 0,
            stretch: 0,
            strokeWidth: 1,
            padStart: 4,
            padEnd: 2,
            stroke: RED,
          },
          [note, peak]
        ),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── B: shorthands (helpers.ts) ──────────────────────────────────────────────
export const B: StoryObj = {
  loaders: [async () => ({ goog: await googMonthly() })],
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    const peak = maxBy(goog, "price") as any;
    // ── spec ──
    chart(goog, { schema: { date: Unit.time() }, w: 560, h: 300 })
      .flow(scatter({ by: "date", x: "date", y: "price" }))
      .mark(blank().name("months"))
      .layer(line({ stroke: "#467DA8", strokeWidth: 2 }))
      .layer(
        callout(chart(selectAll("months")).flow(argmax("price")), {
          note: ["Peak", `$${peak.price} in ${monthYear(peak.date)}`],
          dx: -40,
          dy: 30,
        })
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};
