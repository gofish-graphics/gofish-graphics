// Shared inputs for the label-proposal prototype stories.
import data from "vega-datasets";

/** Gapminder 2005: the 36 most populous countries, most populous first (the
 *  chooser takes labels in this order, so big countries win ties). */
export async function loadCountries() {
  const all = (await data["gapminder.json"]()) as any[];
  return all
    .filter((d) => d.year === 2005)
    .sort((a, b) => b.pop - a.pop)
    .slice(0, 36)
    .map((d) => ({
      country: d.country as string,
      fertility: d.fertility as number,
      life_expect: d.life_expect as number,
      pop: d.pop as number,
    }));
}

/** vega-datasets stocks (MSFT, AMZN, IBM, GOOG, AAPL), monthly 2000-2010, with
 *  ISO dates for the time schema. */
export async function loadStocks() {
  const all = (await data["stocks.csv"]()) as any[];
  return all.map((d) => {
    const t = d.date instanceof Date ? d.date : new Date(d.date);
    const iso = new Date(Date.UTC(t.getFullYear(), t.getMonth(), 1))
      .toISOString()
      .slice(0, 10);
    return { symbol: d.symbol as string, date: iso, price: +d.price };
  });
}

/** Least-squares line of life expectancy on fertility. */
export function fit(rows: { fertility: number; life_expect: number }[]) {
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.fertility, 0) / n;
  const my = rows.reduce((s, r) => s + r.life_expect, 0) / n;
  let sxy = 0,
    sxx = 0;
  for (const r of rows) {
    sxy += (r.fertility - mx) * (r.life_expect - my);
    sxx += (r.fertility - mx) ** 2;
  }
  const b = sxy / sxx;
  return (x: number) => my + b * (x - mx);
}

/** The same stocks averaged per year (2000-2010): eleven points per series,
 *  so a sloped label has a smooth stretch of line to sit on. */
export async function loadYearlyStocks() {
  const rows = await loadStocks();
  const acc = new Map<string, { symbol: string; year: string; sum: number; n: number }>();
  for (const r of rows) {
    const year = r.date.slice(0, 4);
    const k = r.symbol + year;
    const e = acc.get(k) ?? { symbol: r.symbol, year, sum: 0, n: 0 };
    e.sum += r.price;
    e.n += 1;
    acc.set(k, e);
  }
  return [...acc.values()].map((e) => ({
    symbol: e.symbol,
    date: `${e.year}-07-01`,
    price: Math.round((e.sum / e.n) * 100) / 100,
  }));
}
