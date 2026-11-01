// Data prep shared by the annotation proposal stories. Not part of any spec:
// each story's chart code starts after these rows exist.
import data from "vega-datasets";
import { seattleWeather } from "../../../src/data/seatle-weather";

/** GOOG's monthly closing price, 2004-08 to 2010-03 (vega-datasets stocks). */
export const googMonthly = async () =>
  ((await data["stocks.csv"]()) as any[])
    .filter((d) => d.symbol === "GOOG")
    .map((d) => {
      const t = new Date(d.date); // "Nov 1 2007", local time
      const mm = String(t.getMonth() + 1).padStart(2, "0");
      return { date: `${t.getFullYear()}-${mm}-01`, price: +d.price };
    });

/** Yearly average price of each of the five stocks (as LabelPlacement does). */
export const yearlyStocks = async () => {
  const rows = (await data["stocks.csv"]()) as any[];
  const acc = new Map<string, any>();
  for (const d of rows) {
    const year = new Date(d.date).getFullYear();
    const key = `${d.symbol}${year}`;
    const e = acc.get(key) ?? {
      symbol: d.symbol,
      date: `${year}-07-01`,
      sum: 0,
      n: 0,
    };
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

/** Seattle's mean daily high, per month, 2012-2015. */
export const seattleMonthly = (() => {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const d of seattleWeather) {
    const k = d.date.slice(0, 7) + "-15";
    const e = acc.get(k) ?? { sum: 0, n: 0 };
    e.sum += d.temp_max;
    e.n += 1;
    acc.set(k, e);
  }
  return [...acc].map(([date, e]) => ({
    date,
    temp: Math.round((e.sum / e.n) * 10) / 10,
  }));
})();

export const monthYear = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const REGION_COLORS = {
  America: "#5aa3b8",
  "East Asia & Pacific": "#9cb850",
  "Europe & Central Asia": "#f2b45c",
  "Middle East & North Africa": "#a99bc0",
  "South Asia": "#e07b9b",
  "Sub-Saharan Africa": "#47b8a0",
};
