// Data for the "uncertainty as signal" prototypes (#980). GoFish has no
// distribution type yet, so every density grid, quantile and interval is
// precomputed here and handed to the charts as plain rows. Draws use a seeded
// RNG (mulberry32 + Box–Muller) so renders are stable.

import { penguins } from "../../../src/data/penguins";

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A standard normal sampler built on a uniform source (Box–Muller). */
export const normalSampler = (rand: () => number) => () => {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const normPdf = (x: number, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** The standard normal CDF (Abramowitz and Stegun 7.1.26 for erf). */
const normCdf01 = (z: number) => {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
};

/** The standard normal quantile, by bisection on the CDF. */
const normQuantile01 = (p: number) => {
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (normCdf01(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

const normQuantile = (p: number, mu: number, sd: number) =>
  mu + sd * normQuantile01(p);

/** The sample quantile of sorted `xs` at `p` (linear interpolation, type 7). */
const sampleQuantile = (xs: number[], p: number) => {
  const h = (xs.length - 1) * p;
  const i = Math.floor(h);
  return (
    xs[i] + (h - i) * ((xs[Math.min(i + 1, xs.length - 1)] ?? xs[i]) - xs[i])
  );
};

/** A Gaussian KDE of `values` with Silverman's bandwidth. */
const kde = (values: number[]) => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = 1.06 * sd * n ** -0.2;
  return {
    bw,
    f: (x: number) => values.reduce((s, v) => s + normPdf(x, v, bw), 0) / n,
  };
};

/** `n` evenly spaced points over [lo, hi]. */
const grid = (lo: number, hi: number, n: number) =>
  range(n).map((i) => lo + ((hi - lo) * i) / (n - 1));

/** The point interval summary of a normal: median and 66% / 95% bounds. */
const normalIntervals = (mean: number, sd: number) => ({
  median: mean,
  lo66: normQuantile(0.17, mean, sd),
  hi66: normQuantile(0.83, mean, sd),
  lo95: normQuantile(0.025, mean, sd),
  hi95: normQuantile(0.975, mean, sd),
});

// 2. Half-eye: four normal posteriors. Each group has slab rows (a density
// grid over mean ± 4 sd) and one interval row (median, 66%, 95%).
export const halfEyeGroups = [
  { group: "a", mean: 1.0, sd: 1.0 },
  { group: "b", mean: 3.5, sd: 0.6 },
  { group: "c", mean: 2.0, sd: 1.6 },
  { group: "d", mean: 5.0, sd: 0.9 },
];
export const halfEyeRows = halfEyeGroups.flatMap(({ group, mean, sd }) => [
  ...grid(mean - 4 * sd, mean + 4 * sd, 121).map((x) => ({
    group,
    kind: "slab",
    x,
    pdf: normPdf(x, mean, sd),
  })),
  { group, kind: "interval", ...normalIntervals(mean, sd) },
]);

// 3. Multi-level point interval: six normal posteriors, one row each.
export const pointIntervalGroups = [
  { group: "Alpha", mean: 2.1, sd: 0.5 },
  { group: "Bravo", mean: 3.4, sd: 0.9 },
  { group: "Charlie", mean: 1.2, sd: 0.4 },
  { group: "Delta", mean: 4.0, sd: 1.3 },
  { group: "Echo", mean: 2.8, sd: 0.3 },
  { group: "Foxtrot", mean: 0.6, sd: 0.8 },
];
export const pointIntervalRows = pointIntervalGroups.map(
  ({ group, mean, sd }) => ({ group, mean, sd, ...normalIntervals(mean, sd) })
);

// 4. Gradient interval: the same four posteriors as the half-eye, each cut
// into 80 thin cells [x0, x1] carrying the density at the cell's center. The
// density is divided by the largest density of all groups (normalize "all").
const cells = 80;
const allPeak = Math.max(...halfEyeGroups.map(({ sd }) => normPdf(0, 0, sd)));
export const gradientRows = halfEyeGroups.flatMap(({ group, mean, sd }) => {
  const xs = grid(mean - 3.5 * sd, mean + 3.5 * sd, cells + 1);
  return [
    ...range(cells).map((i) => ({
      group,
      kind: "cell",
      x0: xs[i],
      x1: xs[i + 1],
      density: normPdf((xs[i] + xs[i + 1]) / 2, mean, sd) / allPeak,
    })),
    { group, kind: "interval", ...normalIntervals(mean, sd) },
  ];
});

// 5. Quantile dotplot: minutes until the bus arrives, lognormal with median
// 11 minutes. Twenty quantiles at (i + 0.5) / 20, each put in a 1-minute bin
// (the bin's center is the dot's x), stacked by their order in the bin.
const busMu = Math.log(11);
const busSigma = 0.45;
export const busBinWidth = 1;
export const busQuantiles = range(20).map((i) =>
  Math.exp(busMu + busSigma * normQuantile01((i + 0.5) / 20))
);
export const busDots = busQuantiles.map((q, i) => ({
  i,
  minutes: q,
  bin: (Math.floor(q / busBinWidth) + 0.5) * busBinWidth,
}));

// 6. Raincloud: penguin body mass by species. Slab rows are a KDE grid per
// species, one interval row has the sample's median, 66% and 95% bounds, and
// point rows are the raw birds.
const speciesList = ["Adelie", "Chinstrap", "Gentoo"];
export const raincloudRows = speciesList.flatMap((species) => {
  const masses = penguins
    .filter((p) => p.Species === species)
    .map((p) => p["Body Mass (g)"])
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const { f, bw } = kde(masses);
  const lo = masses[0] - 3 * bw;
  const hi = masses[masses.length - 1] + 3 * bw;
  const q = (p: number) => sampleQuantile(masses, p);
  return [
    ...grid(lo, hi, 121).map((mass) => ({
      species,
      kind: "slab",
      mass,
      pdf: f(mass),
    })),
    {
      species,
      kind: "interval",
      median: q(0.5),
      lo66: q(0.17),
      hi66: q(0.83),
      lo95: q(0.025),
      hi95: q(0.975),
    },
    ...masses.map((mass) => ({ species, kind: "point", mass })),
  ];
});

// 7. Fan chart: 12 observed steps, then a 20-step forecast whose sd grows
// with the square root of the horizon. One band row per (step, level) and
// one median row per step.
const zFan = normalSampler(mulberry32(980));
let level = 50;
export const fanHistory = range(13).map((i) => {
  if (i > 0) level += 0.8 + 1.6 * zFan();
  return { t: i - 12, value: level };
});
const last = fanHistory[fanHistory.length - 1].value;
const fanSteps = range(21).map((h) => ({
  t: h,
  median: last + 0.6 * h,
  sd: 2.2 * Math.sqrt(h),
}));
export const fanLevels = [0.95, 0.8, 0.5];
export const fanBands = fanLevels.flatMap((lvl) =>
  fanSteps.map(({ t, median, sd }) => ({
    t,
    level: `${Math.round(lvl * 100)}%`,
    lo: sd === 0 ? median : normQuantile((1 - lvl) / 2, median, sd),
    hi: sd === 0 ? median : normQuantile((1 + lvl) / 2, median, sd),
  }))
);
export const fanMedian = fanSteps.map(({ t, median }) => ({
  t,
  value: median,
}));
