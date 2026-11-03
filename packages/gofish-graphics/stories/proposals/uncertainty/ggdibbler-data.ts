// Data for the "ggdibbler" comparison tab (#980). GoFish has no distribution
// type yet, so every draw is precomputed here with a seeded RNG (mulberry32 +
// Box–Muller, seed 1980) and handed to the charts as a long table of rows.
// The bar, scatter and map examples reuse noise-data.ts. The mpg counts come
// from ggdibbler's own `uncertain_mpg` data set: see
// proposals/uncertainty-specs/ggdibbler-r/export-mpg.R.

import { mulberry32, normalSampler } from "./noise-data";
import mpgCountsJson from "./ggdibbler-mpg-counts.json";

const z = normalSampler(mulberry32(1980));
const normal = (mean: number, sd: number) => mean + sd * z();
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Per draw counts of ggdibbler's `uncertain_mpg` by class and drv
 *  (`sample_expand(times = 10)`, then counted). */
export const mpgCounts = mpgCountsJson as {
  draw: number;
  class: string;
  drv: string;
  n: number;
}[];
/** The same counts, one table per draw (for the layer-of-charts overlay). */
export const mpgCountsByDraw = range(10).map((d) =>
  mpgCounts.filter((r) => r.draw === d + 1)
);

// Forecast: ten steps ahead, each step a normal whose sd grows like a random
// walk's, sd = 2 * sqrt(h).
export const forecastEstimates = range(10).map((i) => {
  const h = i + 1;
  return { h, mean: 50 + 2 * h, sd: 2 * Math.sqrt(h) };
});
/** Thirty independent draws per step (what ggdibbler draws). */
export const forecastDraws = forecastEstimates.flatMap(({ h, mean, sd }) =>
  range(30).map((draw) => ({ h, draw, value: normal(mean, sd) }))
);
/** Thirty joint draws: whole random-walk paths with the same marginals. */
export const forecastPaths = range(30).flatMap((draw) => {
  let y = 50;
  return range(10).map((i) => {
    y += 2 + normal(0, 2);
    return { h: i + 1, draw, value: y };
  });
});

// Correlated x and y: eight points, each a bivariate normal.
export const corrEstimates = range(8).map((i) => ({
  id: `p${i}`,
  x: 10 + i * 10,
  y: 20 + i * 7 + (i % 2 ? 6 : -6),
  sdX: 4,
  sdY: 6,
  rho: [0.85, -0.85, 0][i % 3],
  cor: ["positive", "negative", "none"][i % 3],
}));
export const corrDraws = corrEstimates.flatMap(
  ({ id, x, y, sdX, sdY, rho, cor }) =>
  range(40).map((draw) => {
    const a = z();
    const b = rho * a + Math.sqrt(1 - rho * rho) * z();
    return {
      id,
      draw,
      cor,
      x: x + sdX * a,
      y: y + sdY * b,
    };
  })
);

// Two levels of uncertainty (ggdibbler issue #55): mu ~ normal(mean, tau),
// value ~ normal(mu, se). Eight outer draws of mu, ten inner draws each.
export const nestedEstimates = [
  { category: "A", mean: 30, tau: 6, se: 3 },
  { category: "B", mean: 50, tau: 3, se: 8 },
  { category: "C", mean: 42, tau: 9, se: 2 },
];
export const nestedDraws = nestedEstimates.flatMap(
  ({ category, mean, tau, se }) =>
    range(8).flatMap((outer) => {
      const mu = normal(mean, tau);
      return range(10).map((inner) => ({
        category,
        outer,
        inner,
        value: normal(mu, se),
      }));
    })
);

// Uncertain treemap: six budget lines, each normal(mean, se), six draws.
export const budgetEstimates = [
  { item: "Staff", mean: 40, se: 4 },
  { item: "Rent", mean: 22, se: 2 },
  { item: "Travel", mean: 12, se: 6 },
  { item: "Equipment", mean: 15, se: 7 },
  { item: "Software", mean: 7, se: 3 },
  { item: "Other", mean: 4, se: 2 },
];
export const budgetDraws = range(6).flatMap((draw) =>
  budgetEstimates.map(({ item, mean, se }) => ({
    item,
    draw,
    value: Math.max(0.5, normal(mean, se)),
  }))
);

// Uncertain dates (ggdibbler issue #49): five milestones, each date a
// normal in days around its planned date, thirty draws, rounded to a day.
const DAY = 864e5;
export const milestoneEstimates = [
  { milestone: "Design", date: "2026-02-02", sdDays: 4 },
  { milestone: "Prototype", date: "2026-03-16", sdDays: 9 },
  { milestone: "Pilot", date: "2026-05-04", sdDays: 14 },
  { milestone: "Launch", date: "2026-06-15", sdDays: 20 },
  { milestone: "Review", date: "2026-08-03", sdDays: 28 },
];
export const milestoneDraws = milestoneEstimates.flatMap(
  ({ milestone, date, sdDays }) =>
    range(30).map((draw) => ({
      milestone,
      draw,
      date: new Date(
        Date.parse(date) + Math.round(normal(0, sdDays)) * DAY
      )
        .toISOString()
        .slice(0, 10),
    }))
);
