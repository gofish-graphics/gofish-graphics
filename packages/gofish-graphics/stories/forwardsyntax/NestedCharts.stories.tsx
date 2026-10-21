import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, scatter, circle, line, rect, text } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Nested Charts",
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

// Quarterly sales at three stores.
const sales = [
  { store: "North", quarter: 1, sales: 32 },
  { store: "North", quarter: 2, sales: 41 },
  { store: "North", quarter: 3, sales: 38 },
  { store: "North", quarter: 4, sales: 52 },
  { store: "Harbor", quarter: 1, sales: 24 },
  { store: "Harbor", quarter: 2, sales: 22 },
  { store: "Harbor", quarter: 3, sales: 30 },
  { store: "Harbor", quarter: 4, sales: 27 },
  { store: "Hill", quarter: 1, sales: 45 },
  { store: "Hill", quarter: 2, sales: 39 },
  { store: "Hill", quarter: 3, sales: 33 },
  { store: "Hill", quarter: 4, sales: 36 },
];

// A `.layer(...)` chain in a mark position (#1181): one small line chart per
// store, dots with a line over them. The chain's first tier is an empty
// `chart()` scope, so it draws the store's rows, and the line tier connects
// the dots that tier drew.
export const ConnectedDotsPerGroup: StoryObj<Args> = {
  args: { w: 420, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(sales, { w: args.w, h: args.h })
      .flow(spread({ by: "store", dir: "x", spacing: 32 }))
      .mark(
        chart({ axes: false })
          .flow(scatter({ by: "quarter", x: "quarter", y: "sales" }))
          .mark(circle({ r: 4, fill: "#08519c" }))
          .layer(line({ stroke: "#6baed6", strokeWidth: 2 }))
      )
      .render(container);
    return container;
  },
};

// Hourly temperatures from Feb 28 00:00 to Mar 2 12:00, 2024 (UTC), as JS
// Dates: a Date column is a time without a schema entry.
const readings = (() => {
  const start = Date.UTC(2024, 1, 28);
  const out: { time: Date; temp: number }[] = [];
  for (let h = 0; h <= 84; h++) {
    const temp =
      4 - 5 * Math.cos(((h - 3) / 24) * 2 * Math.PI) + 0.4 * Math.sin(h * 1.7);
    out.push({
      time: new Date(start + h * 36e5),
      temp: Math.round(temp * 10) / 10,
    });
  }
  return out;
})();

// Each day's high: the first hottest reading of each UTC day.
const dailyHighs = (() => {
  const high = new Map<string, { time: Date; temp: number }>();
  for (const r of readings) {
    const day = r.time.toISOString().slice(0, 10);
    const best = high.get(day);
    if (best === undefined || r.temp > best.temp) high.set(day, r);
  }
  return [...high.values()];
})();

// A chart with rows of its own in a mark position (#1088): the hourly line,
// with a tier over it that draws each day's high from a table of its own. The
// tier's rows, with their time column, travel as a table of their own, so
// they keep their time type and share the line's time axis.
export const DailyHighsOverReadings: StoryObj<Args> = {
  args: { w: 560, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(readings, { w: args.w, h: args.h })
      .flow(scatter({ by: "time", x: "time", y: "temp" }))
      .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
      .layer(
        chart(dailyHighs)
          .flow(scatter({ by: "time", x: "time", y: "temp" }))
          .mark(circle({ r: 4, fill: "firebrick" }))
      )
      .render(container);
    return container;
  },
};

// An empty `chart()` scope as a child of a combinator in a mark position: per
// store, its name under a small bar chart of its quarters. The mark is the
// `spread([...])`, and its chart child binds the store's rows, as an empty
// scope does wherever a chart sits.
export const CaptionedBarsPerGroup: StoryObj<Args> = {
  args: { w: 420, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(sales, { axes: false, w: args.w, h: args.h })
      .flow(spread({ by: "store", dir: "x", spacing: 32, alignment: "end" }))
      .mark(
        spread({ dir: "y", spacing: 8, alignment: "middle" }, [
          chart()
            .flow(spread({ by: "quarter", dir: "x", spacing: 4 }))
            .mark(rect({ w: 16, h: "sales", fill: "#08519c" })),
          text({ text: "store", fontSize: 12 }),
        ])
      )
      .render(container);
    return container;
  },
};
