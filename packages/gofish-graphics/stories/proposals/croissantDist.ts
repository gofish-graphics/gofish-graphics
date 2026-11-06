// THROWAWAY prototype helpers for the croissant-sampling proposal (#1332).
// A plain-object stand-in for #980's Dist, and the data the stories use.
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";

export const FILL = "#D1E4F6";
export const STROKE = "#467DA8";
export const PAPER_FILL = "#CBA45F";
export const PAPER_STROKE = "#745931";

export type Dist = {
  pdf: (x: number) => number;
  cdf: (x: number) => number;
  quantile: (p: number) => number;
  /** The default range a density curve covers. */
  range: [number, number];
};

const SQRT2PI = Math.sqrt(2 * Math.PI);
const erf = (x: number) => {
  // Abramowitz and Stegun 7.1.26
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
};
const phi = (z: number) => Math.exp(-0.5 * z * z) / SQRT2PI;
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const invert =
  (cdf: (x: number) => number, lo: number, hi: number) => (p: number) => {
    let a = lo;
    let b = hi;
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2;
      if (cdf(m) < p) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };

/** dist.normal: range = the 0.001 and 0.999 quantiles, as ggdist does. */
export const normal = (mean = 0, sd = 1): Dist => {
  const cdf = (x: number) => Phi((x - mean) / sd);
  const quantile = invert(cdf, mean - 12 * sd, mean + 12 * sd);
  return {
    pdf: (x) => phi((x - mean) / sd) / sd,
    cdf,
    quantile,
    range: [quantile(0.001), quantile(0.999)],
  };
};

/** field(x).kde({ smoothing }): Gaussian kernels, Silverman's bandwidth by
 *  default; range = data extent plus 3 bandwidths each side. */
export const kde = (values: number[], smoothing?: number): Dist => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = smoothing ?? 1.06 * sd * n ** -0.2;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const cdf = (x: number) =>
    values.reduce((s, v) => s + Phi((x - v) / bw), 0) / n;
  return {
    pdf: (x) => values.reduce((s, v) => s + phi((x - v) / bw), 0) / (n * bw),
    cdf,
    quantile: invert(cdf, lo - 10 * bw, hi + 10 * bw),
    range: [lo - 3 * bw, hi + 3 * bw],
  };
};

/** Emulates binning a Dist: rows at its exact quantiles. */
export const exactQuantiles = (d: Dist, n = 2000) =>
  Array.from({ length: n }, (_, i) => ({ v: d.quantile((i + 0.5) / n) }));

export const masses = penguins
  .map((p) => p["Body Mass (g)"])
  .filter((v): v is number => v != null);

export const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const weather = seattleWeather.map((d) => ({
  month: months[new Date(d.date).getUTCMonth()],
  temp_max: d.temp_max,
}));
export const monthDist = (rows: { temp_max: number }[]) =>
  kde(rows.map((r) => r.temp_max));
