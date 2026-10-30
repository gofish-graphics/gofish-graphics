// Data for the "uncertainty as noise" prototypes (#980). GoFish has no
// distribution type yet, so every draw is precomputed here with a seeded RNG
// (mulberry32 + Box–Muller) and handed to the charts as a long table of rows.

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

const z = normalSampler(mulberry32(980));
const normal = (mean: number, sd: number) => mean + sd * z();
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// 1. Uncertain bar chart: five estimates, each normal(mean, se).
export const barEstimates = [
  { category: "A", mean: 28, se: 4 },
  { category: "B", mean: 55, se: 6 },
  { category: "C", mean: 43, se: 9 },
  { category: "D", mean: 91, se: 5 },
  { category: "E", mean: 81, se: 12 },
];
export const barDraws = barEstimates.flatMap(({ category, mean, se }) =>
  range(20).map((draw) => ({ category, draw, value: normal(mean, se) }))
);

// 2–3. Uncertain stacked bar: sales by region and product.
export const salesEstimates = [
  { region: "North", product: "Tea", mean: 30, se: 5 },
  { region: "North", product: "Coffee", mean: 45, se: 8 },
  { region: "North", product: "Juice", mean: 15, se: 4 },
  { region: "South", product: "Tea", mean: 20, se: 6 },
  { region: "South", product: "Coffee", mean: 60, se: 10 },
  { region: "South", product: "Juice", mean: 25, se: 5 },
  { region: "East", product: "Tea", mean: 40, se: 7 },
  { region: "East", product: "Coffee", mean: 30, se: 6 },
  { region: "East", product: "Juice", mean: 20, se: 8 },
  { region: "West", product: "Tea", mean: 25, se: 4 },
  { region: "West", product: "Coffee", mean: 50, se: 12 },
  { region: "West", product: "Juice", mean: 35, se: 6 },
];
export const salesDraws = range(20).flatMap((draw) =>
  salesEstimates.map(({ region, product, mean, se }) => ({
    region,
    product,
    draw,
    sales: Math.max(0, normal(mean, se)),
  }))
);
/** The same draws, one table per draw (for the layer-of-charts overlay). */
export const salesDrawsByDraw = range(20).map((d) =>
  salesDraws.filter((r) => r.draw === d)
);

// 4. Uncertain scatter: twelve points, x and y both normal.
export const pointEstimates = range(12).map((i) => {
  const x = 10 + i * 7 + normal(0, 3);
  return {
    id: `p${i}`,
    group: ["a", "b", "c"][i % 3],
    x,
    y: 20 + 0.6 * x + normal(0, 8),
    xSe: 1.5 + (i % 4),
    ySe: 2 + ((i * 5) % 6),
  };
});
export const pointDraws = pointEstimates.flatMap(({ id, group, x, y, xSe, ySe }) =>
  range(30).map((draw) => ({
    id,
    group,
    draw,
    x: normal(x, xSe),
    y: normal(y, ySe),
  }))
);

// 5. HOPs: four bars, six draws (frames).
export const hopEstimates = [
  { category: "A", mean: 40, se: 10 },
  { category: "B", mean: 55, se: 12 },
  { category: "C", mean: 48, se: 6 },
  { category: "D", mean: 62, se: 15 },
];
export const hopDraws = range(6).flatMap((draw) =>
  hopEstimates.map(({ category, mean, se }) => ({
    category,
    draw,
    value: Math.max(0, normal(mean, se)),
  }))
);

// 6. Uncertain map: an 8×6 grid of square regions, each normal(mean, sd).
// The mean is a smooth surface; the sd grows to the east so the noisy
// tiles are easy to see.
export const tileEstimates = range(6).flatMap((row) =>
  range(8).map((col) => ({
    col,
    row,
    mean: 50 + 25 * Math.sin(col / 2.2) * Math.cos(row / 2.5),
    sd: 2 + col * 3,
  }))
);
/** Sixteen draws per tile, each with its cell in a 4×4 subgrid. */
export const tileDraws = tileEstimates.flatMap(({ col, row, mean, sd }) =>
  range(16).map((draw) => ({
    col,
    row,
    /** The row counted from the bottom, for placing tiles with scatter (y up). */
    rowUp: 5 - row,
    draw,
    sx: draw % 4,
    sy: Math.floor(draw / 4),
    value: normal(mean, sd),
  }))
);
