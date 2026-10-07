import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  scatter,
  line,
  circle,
  rect,
  field,
  Schema,
  Calendar,
} from "../../src/lib";
import { lcg } from "../../src/util/lcg";

const meta: Meta = {
  title: "Forward Syntax/Time",
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

const DAY = 864e5;

// Fourteen months of daily prices, Nov 2023 to Dec 2024, as date strings: a
// random walk with a slow swell.
const prices = (() => {
  const rand = lcg(7);
  const start = Date.UTC(2023, 10, 1);
  const end = Date.UTC(2024, 11, 31);
  const out: { date: string; price: number }[] = [];
  let p = 100;
  for (let t = start, i = 0; t <= end; t += DAY, i++) {
    p += (rand() - 0.5) * 2.2 + Math.sin(i / 40) * 0.25;
    out.push({
      date: new Date(t).toISOString().slice(0, 10),
      price: Math.round(p * 100) / 100,
    });
  }
  return out;
})();

export const DailyLine: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Daily Price Line",
      description:
        "Fourteen months of daily prices drawn as a line on a time axis, with months labeled in the inner row and years in the outer row.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(prices, { schema: { date: Schema.time() }, axes: true })
      .flow(scatter({ by: "date", x: "date", y: "price" }))
      .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Hourly temperatures from Feb 28 00:00 to Mar 2 12:00, 2024 (UTC, a leap
// year), as JS Dates: a Date column is a time without a schema entry.
const readings = (() => {
  const rand = lcg(3);
  const start = Date.UTC(2024, 1, 28);
  const out: { time: Date; temp: number }[] = [];
  for (let h = 0; h <= 84; h++) {
    const temp =
      4 - 5 * Math.cos(((h - 3) / 24) * 2 * Math.PI) + (rand() - 0.5) * 0.8;
    out.push({
      time: new Date(start + h * 36e5),
      temp: Math.round(temp * 10) / 10,
    });
  }
  return out;
})();

export const HourlyLine: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Hourly Temperature Line",
      description:
        "Three and a half days of hourly temperatures across Feb 29 and the turn of the month, with hours in the inner axis row and days in the outer row.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(readings, { axes: true })
      .flow(scatter({ by: "time", x: "time", y: "temp" }))
      .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Hourly readings in New York across the spring daylight saving change: the
// clock jumps from 2 AM to 3 AM on Mar 10, so that day is 23 hours long and
// its 12 AM to 6 AM cell is 5 hours wide. The values are instants (epoch
// milliseconds); the axis reads them in the schema's zone.
const newYork = Array.from({ length: 72 }, (_, h) => {
  const t = Date.UTC(2024, 2, 9, 5) + h * 36e5; // Mar 9, midnight in New York
  return { time: t, load: Math.round(50 + 30 * Math.sin((h / 24) * 2 * Math.PI)) };
});

export const DaylightSavingZone: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(newYork, {
      schema: { time: Schema.time({ zone: "America/New_York" }) },
      axes: true,
    })
      .flow(scatter({ by: "time", x: "time", y: "load" }))
      .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Release dates over about six years.
const releases = [
  ["v1.0", "2018-03-12"],
  ["v1.1", "2018-09-03"],
  ["v1.2", "2019-02-18"],
  ["v2.0", "2019-10-07"],
  ["v2.1", "2020-05-25"],
  ["v2.2", "2020-12-01"],
  ["v3.0", "2021-08-16"],
  ["v3.1", "2022-04-04"],
  ["v3.2", "2022-10-31"],
  ["v4.0", "2023-06-19"],
  ["v4.1", "2024-01-08"],
  ["v5.0", "2024-06-24"],
].map(([name, date]) => ({ name, date }));

export const EventTimeline: StoryObj<Args> = {
  args: { w: 560, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(releases, {
      schema: { date: Schema.time() },
      axes: { x: true, y: false },
    })
      .flow(scatter({ by: "name", x: "date" }))
      .mark(circle({ r: 5, fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Daily counts over ten weeks, with a week row over a month row: rows are
// independent partitions of the time line, so they need not nest.
const visits = (() => {
  const rand = lcg(11);
  const start = Date.UTC(2024, 0, 22);
  return Array.from({ length: 70 }, (_, i) => ({
    day: new Date(start + i * DAY).toISOString().slice(0, 10),
    visits: Math.round(
      120 + 40 * Math.sin((i / 7) * 2 * Math.PI) + rand() * 30
    ),
  }));
})();

export const WeekOverMonthRows: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(visits, {
      schema: { day: Schema.time() },
      axes: { x: { rows: [Calendar.week, Calendar.month] }, y: true },
    })
      .flow(scatter({ by: "day", x: "day", y: "visits" }))
      .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Revenue per calendar quarter, each bar spanning its quarter, with one
// Tableau-style label row whose labels come from a format function.
const revenue = [
  ["2023-10-01", "2024-01-01", 342],
  ["2024-01-01", "2024-04-01", 325],
  ["2024-04-01", "2024-07-01", 402],
  ["2024-07-01", "2024-10-01", 393],
  ["2024-10-01", "2025-01-01", 444],
  ["2025-01-01", "2025-04-01", 431],
  ["2025-04-01", "2025-07-01", 451],
  ["2025-07-01", "2025-10-01", 547],
  ["2025-10-01", "2026-01-01", 577],
].map(([start, end, amount]) => ({ start, end, amount }));

export const QuarterlyBars: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(revenue, {
      schema: { start: Schema.time(), end: Schema.time() },
      axes: {
        x: {
          title: false,
          rows: [
            {
              unit: Calendar.quarter,
              format: (cell) =>
                `Q${Math.ceil(cell.zoned.month / 3)} '${String(cell.zoned.year).slice(2)}`,
            },
          ],
        },
        y: true,
      },
    })
      // The two ends are one kind of quantity (dates), so they share a
      // measure.
      .flow(
        scatter({
          by: "start",
          xMin: field("start", "date"),
          xMax: field("end", "date"),
        })
      )
      .mark(rect({ h: "amount" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
