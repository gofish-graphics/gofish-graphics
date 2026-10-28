import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seattleWeather } from "../../src/data/seatle-weather";
import {
  chart,
  rect,
  field,
  spread,
  stack,
  partition,
  Unit,
  Calendar,
  Bin,
  table,
  Color,
} from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Bin",
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

// Seventy-two movie ratings from 1 to 9.5, none from 2 to 2.5: a hump around
// 6.5 with a thin low tail.
const movies = [
  1.2, 1.6, 1.8, 2.6, 2.9, 3.1, 3.4, 3.6, 3.8, 4.0, 4.1, 4.3, 4.4, 4.6, 4.7,
  4.8, 4.9, 5.0, 5.1, 5.2, 5.3, 5.3, 5.4, 5.5, 5.6, 5.6, 5.7, 5.8, 5.9, 5.9,
  6.0, 6.0, 6.1, 6.2, 6.2, 6.3, 6.3, 6.4, 6.4, 6.5, 6.5, 6.5, 6.6, 6.6, 6.7,
  6.7, 6.8, 6.8, 6.9, 6.9, 7.0, 7.0, 7.1, 7.2, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7,
  7.8, 7.9, 8.0, 8.1, 8.2, 8.4, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5,
].map((rating) => ({ rating }));

export const RatingHistogram: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Rating Histogram",
      description:
        "A histogram of movie ratings in half-point bins, where the empty bin from 2 to 2.5 keeps its place.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(movies, { axes: true })
      .flow(
        spread({
          by: field("rating").bin(Bin.step(0.5)),
          dir: "x",
          spacing: 1,
        })
      )
      .mark(rect({ h: field("rating").count(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

const DAY = 864e5;

// Daily sales in three regions from January to August 2024.
const allDaily = (() => {
  const out: { date: string; region: string; value: number }[] = [];
  const start = Date.UTC(2024, 0, 1);
  const end = Date.UTC(2024, 7, 31);
  const regions = ["North", "South", "West"];
  for (let t = start, i = 0; t <= end; t += DAY, i++) {
    const date = new Date(t).toISOString().slice(0, 10);
    regions.forEach((region, r) => {
      const value =
        10 + 4 * Math.sin(i / 20 + r) + 2 * Math.sin(i / 3.1 + 2 * r) + 3 * r;
      out.push({ date, region, value: Math.round(value * 10) / 10 });
    });
  }
  return out;
})();

// The same sales with none at all in April (the store was closed).
const daily = allDaily.filter((d) => !d.date.startsWith("2024-04"));

export const MonthlyBars: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Monthly Sales Bars",
      description:
        "Daily sales binned into calendar months as equal-width bars, with the closed month of April kept as an empty slot.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(daily, { schema: { date: Unit.time() }, axes: true })
      .flow(spread({ by: field("date").bin(Calendar.year).bin(Calendar.month), dir: "x" }))
      .mark(rect({ h: field("value").sum(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const StackedMonthlyBars: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Monthly Sales",
      description:
        "Monthly sales stacked by region, with daily sales binned into calendar months as equal-width bars.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(allDaily, { schema: { date: Unit.time() }, axes: true })
      .flow(
        spread({ by: field("date").bin(Calendar.year).bin(Calendar.month), dir: "x" }),
        stack({ by: "region", dir: "y" })
      )
      .mark(rect({ h: field("value").sum(), fill: "region" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const RatingHistogramContinuous: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Rating Histogram on a Continuous Axis",
      description:
        "A histogram of movie ratings in half-point bins placed on a continuous rating axis, where the empty bin from 2 to 2.5 keeps its gap.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(movies, { axes: true })
      .flow(partition({ by: field("rating").bin(Bin.step(0.5)), dir: "x" }))
      .mark(rect({ h: field("rating").count(), fill: "steelblue", inset: 0.5 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const MonthBarsTrueWidths: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Monthly Sales on a Time Axis",
      description:
        "Daily sales binned into calendar months, each bar as wide as its month, so February is narrower than March.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(allDaily, { schema: { date: Unit.time() }, axes: true })
      .flow(partition({ by: field("date").bin([Calendar.year, Calendar.month]), dir: "x" }))
      .mark(rect({ h: field("value").sum(), fill: "steelblue", inset: 1 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const StackedMonthBarsTrueWidths: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Stacked Monthly Sales on a Time Axis",
      description:
        "Monthly sales stacked by region, each stack as wide as its month, with the closed month of April kept as a gap.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(daily, { schema: { date: Unit.time() }, axes: true })
      .flow(
        partition({ by: field("date").bin(Calendar.year).bin(Calendar.month), dir: "x" }),
        stack({ by: "region", dir: "y" })
      )
      .mark(rect({ h: field("value").sum(), fill: "region", inset: 1 }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const GroupedMonthBarsTrueWidths: StoryObj<Args> = {
  args: { w: 560, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Grouped Monthly Sales on a Time Axis",
      description:
        "Monthly sales by region, grouped side by side inside each month, so February's group is narrower than March's.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(allDaily, { schema: { date: Unit.time() }, axes: true })
      .flow(
        partition({ by: field("date").bin([Calendar.year, Calendar.month]), dir: "x" }),
        spread({ by: "region", dir: "x" })
      )
      .mark(rect({ h: field("value").sum(), fill: "region" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// Seattle's daily weather, 2012 to 2015.
const weather = seattleWeather;

// The days from `from` to `to` (ISO dates, `to` excluded).
const between = (from: string, to: string) =>
  weather.filter((d) => d.date >= from && d.date < to);

export const SeasonalPrecipitation: StoryObj<Args> = {
  args: { w: 560, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Rain by Month of the Year",
      description:
        "Seattle's average daily rainfall in each month of the year, with the Junes of four years pooled into one June bar.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(weather, { schema: { date: Unit.time() }, axes: true })
      .flow(spread({ by: field("date").bin(Calendar.month), dir: "x" }))
      .mark(rect({ h: field("precipitation").mean(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const MonthBarsProduct: StoryObj<Args> = {
  args: { w: 600, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Rain by Month",
      description:
        "Seattle's total rainfall in each month from July 2014 to June 2015, one bar per month labeled with its month and year.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(between("2014-07-01", "2015-07-01"), {
      schema: { date: Unit.time() },
      axes: { x: { label: { angle: "auto" } }, y: true },
    })
      .flow(
        spread({ by: field("date").bin([Calendar.year, Calendar.month]), dir: "x" })
      )
      .mark(rect({ h: field("precipitation").sum(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const MonthBarsChained: StoryObj<Args> = {
  args: { w: 640, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Rain by Month and Year",
      description:
        "Seattle's total rainfall in each month of 2014 and 2015, with the months labeled under each bar and the years below them.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(between("2014-01-01", "2016-01-01"), {
      schema: { date: Unit.time() },
      axes: true,
    })
      .flow(
        spread({
          by: field("date").bin(Calendar.year).bin(Calendar.month),
          dir: "x",
        })
      )
      .mark(rect({ h: field("precipitation").sum(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// The winter of 2014 to 2015: October to March.
const winter = between("2014-10-01", "2015-04-01");

// The kinds of weather, sunniest first.
const byWeather = field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"]);

export const GroupedMonthBars: StoryObj<Args> = {
  args: { w: 640, h: 240 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Winter Weather by Month",
      description:
        "How many days of each kind of weather Seattle had in each month from October 2014 to March 2015, grouped by month, with dividers between the months and the years.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(winter, {
      schema: { date: Unit.time() },
      axes: { x: { label: { angle: "auto" } }, y: true },
    })
      .flow(
        spread({
          by: field("date").bin(Calendar.year).bin(Calendar.month),
          dir: "x",
          spacing: 12,
        }),
        spread({ by: byWeather, dir: "x", spacing: 1 })
      )
      .mark(rect({ h: field("weather").count(), fill: "weather" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const GroupedMonthBarsHiddenInner: StoryObj<Args> = {
  args: { w: 640, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(winter, {
      schema: { date: Unit.time() },
      axes: { x: { levels: [false, true] }, y: true },
    })
      .flow(
        spread({
          by: field("date").bin(Calendar.year).bin(Calendar.month),
          dir: "x",
          spacing: 12,
        }),
        spread({ by: byWeather, dir: "x", spacing: 1 })
      )
      .mark(rect({ h: field("weather").count(), fill: "weather" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const MonthBarsProductTrueWidths: StoryObj<Args> = {
  args: { w: 640, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Rain on a Time Axis",
      description:
        "Seattle's total rainfall in each month of 2014 and 2015, each bar as wide as its month on a time axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(between("2014-01-01", "2016-01-01"), {
      schema: { date: Unit.time() },
      axes: true,
    })
      .flow(
        partition({
          by: field("date").bin([Calendar.year, Calendar.month]),
          dir: "x",
        })
      )
      .mark(
        rect({ h: field("precipitation").sum(), fill: "steelblue", inset: 1 })
      )
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const WeekdayTemperature: StoryObj<Args> = {
  args: { w: 420, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Highs by Day of the Week",
      description:
        "Seattle's average daily high temperature on each day of the week from 2012 to 2015, with every Monday of four years pooled into one Monday bar.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(weather, { schema: { date: Unit.time() }, axes: true })
      .flow(spread({ by: field("date").bin(Calendar.weekday), dir: "x" }))
      .mark(rect({ h: field("temp_max").mean(), fill: "steelblue" }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

export const CalendarHeatmap: StoryObj<Args> = {
  args: { w: 1100, h: 120 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Highs Calendar Heatmap",
      description:
        "Four years of Seattle weather, one square per day in a column per week and a row per day of the week, shaded by the day's high temperature, with each week under the month it starts in.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(weather, {
      schema: { date: Unit.time() },
      color: Color.gradient(["#fee8c8", "#fd8d3c", "#bd0026"]),
      axes: {
        x: { title: false, levels: [false, Calendar.month, Calendar.year] },
        y: { title: false },
      },
    })
      .flow(
        table({
          // Weeks from Sunday, as GitHub's calendar has them: 2012 starts
          // on a Sunday, so the first column is the first week of 2012.
          by: {
            x: field("date").bin(Calendar.week({ start: "sunday" })),
            y: field("date").bin(Calendar.weekday({ start: "sunday" })),
          },
          spacing: 1,
        })
      )
      .mark(rect({ fill: field("temp_max").mean() }))
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};
