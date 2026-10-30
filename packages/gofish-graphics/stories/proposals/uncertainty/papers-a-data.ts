// Data for the "Papers A" uncertainty prototypes (#980). Every draw, density
// and summary is precomputed here with a seeded RNG, so renders are stable.
// None of this is chart code: the stories only read the arrays below.

// ---------------------------------------------------------------------------
// Seeded random numbers
// ---------------------------------------------------------------------------

/** mulberry32: a small seeded uniform RNG on [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller: a standard normal draw from a uniform RNG. */
export function normal(rng: () => number) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang gamma draw (shape a ≥ 1), used for Dirichlet and χ². */
function gamma(rng: () => number, a: number): number {
  if (a < 1) return gamma(rng, a + 1) * Math.pow(rng(), 1 / a);
  const d = a - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

const round = (x: number, k = 3) => Math.round(x * 10 ** k) / 10 ** k;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// ---------------------------------------------------------------------------
// 1. Bootstrap regression spaghetti (Petek, Nabergoj, Štrumbelj)
// ---------------------------------------------------------------------------

const rng1 = mulberry32(980_1);

/** Forty observed points: y = 1.5 + 0.6 x + noise. Certain, drawn crisp. */
export const bootPoints = Array.from({ length: 40 }, (_, i) => {
  const x = round(0.5 + 9 * rng1(), 2);
  return { id: i, x, y: round(1.5 + 0.6 * x + 1.3 * normal(rng1), 2) };
});

function olsFit(rows: { x: number; y: number }[]) {
  const mx = mean(rows.map((r) => r.x));
  const my = mean(rows.map((r) => r.y));
  let sxy = 0,
    sxx = 0;
  for (const r of rows) {
    sxy += (r.x - mx) * (r.y - my);
    sxx += (r.x - mx) ** 2;
  }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** By hand today: 39 bootstrap resamples, one OLS line each, given by its two
 *  endpoints. The proposed `resample({ n: 39 })` would make these draws. */
export const bootLines = Array.from({ length: 39 }, (_, draw) => {
  const sample = bootPoints.map(
    () => bootPoints[Math.floor(rng1() * bootPoints.length)]
  );
  const { a, b } = olsFit(sample);
  return [0, 10].map((x) => ({ draw, x, y: round(a + b * x) }));
}).flat();

// ---------------------------------------------------------------------------
// 2. Weighted multiple-forecast lines (Zou et al.)
// ---------------------------------------------------------------------------

const rng2 = mulberry32(980_2);

/** Nine forecast models of a temperature anomaly (°C) over 30 months, each
 *  with a model weight from 0.1 to 1. Long table, one row per (model, month). */
export const forecastWeights = [1, 0.85, 0.7, 0.6, 0.45, 0.35, 0.25, 0.15, 0.1];

export const forecasts = forecastWeights.flatMap((weight, m) => {
  const drift = 0.025 * normal(rng2) + 0.012;
  let v = 0.4;
  return Array.from({ length: 30 }, (_, month) => {
    if (month > 0)
      v += drift + 0.06 * normal(rng2) + 0.05 * Math.sin(month / 2 + m);
    return { model: `m${m + 1}`, weight, month, temp: round(v) };
  });
});

// ---------------------------------------------------------------------------
// 3. VMC "aggregate per draw" (Guo, Kale, Kay, Hullman)
// ---------------------------------------------------------------------------

const rng3 = mulberry32(980_3);
const N_OBS = 50;

/** Observed data: 50 right-skewed values (a sum of exponentials). */
export const observed = Array.from({ length: N_OBS }, () => ({
  y: round(-Math.log(rng3()) - 0.6 * Math.log(rng3()) + 1, 2),
}));
export const observedMean = round(mean(observed.map((d) => d.y)));

/** The observed mean as a vertical rule: two points, count 0 to 22. */
export const observedMeanRule = [
  { mean: observedMean, count: 0 },
  { mean: observedMean, count: 22 },
];

/** 200 posterior-predictive replicates of the whole dataset under a Normal
 *  model: draw (μ, σ) from the posterior, then 50 values. Long table, one
 *  row per (draw, i). Draws are shared across rows: a draw is one replicate. */
export const replicates = (() => {
  const ys = observed.map((d) => d.y);
  const ybar = mean(ys);
  const s2 = ys.reduce((s, y) => s + (y - ybar) ** 2, 0) / (N_OBS - 1);
  const out: { draw: number; i: number; y: number }[] = [];
  for (let draw = 0; draw < 200; draw++) {
    const sigma = Math.sqrt(
      ((N_OBS - 1) * s2) / (2 * gamma(rng3, (N_OBS - 1) / 2))
    );
    const mu = ybar + (sigma / Math.sqrt(N_OBS)) * normal(rng3);
    for (let i = 0; i < N_OBS; i++)
      out.push({ draw, i, y: round(mu + sigma * normal(rng3)) });
  }
  return out;
})();

// ---------------------------------------------------------------------------
// 4a. jk-CDF band (Piccolotto et al.)
// ---------------------------------------------------------------------------

const rng4 = mulberry32(980_4);
const N_JK = 15;

/** Fifteen observations of a continuous measurement. */
export const jkObs = Array.from({ length: N_JK }, () =>
  round(10 + 2 * normal(rng4), 2)
).sort((a, b) => a - b);

/** The empirical CDF as a step function: one row per observation, plus the
 *  two ends. Drawn with `Curve.step()`. */
export const ecdf = [
  { x: 4, p: 0 },
  ...jkObs.map((x, i) => ({ x, p: round((i + 1) / N_JK) })),
  { x: 16, p: 1 },
];

/** 50 posterior draws of (μ, σ) for a Normal model of jkObs (flat prior).
 *  One row per draw: each draw is a whole distribution, Normal(μ, σ). */
export const jkParamDraws = (() => {
  const ybar = mean(jkObs);
  const s2 = jkObs.reduce((s, y) => s + (y - ybar) ** 2, 0) / (N_JK - 1);
  return Array.from({ length: 50 }, (_, draw) => {
    const sigma = Math.sqrt(
      ((N_JK - 1) * s2) / (2 * gamma(rng4, (N_JK - 1) / 2))
    );
    const mu = ybar + (sigma / Math.sqrt(N_JK)) * normal(rng4);
    return { draw, mu: round(mu), sigma: round(sigma) };
  });
})();

/** By hand today: each draw's CDF evaluated on a grid of 61 x values. Long
 *  table, one row per (draw, x). */
export const jkCdfDraws = jkParamDraws.flatMap(({ draw, mu, sigma }) =>
  Array.from({ length: 61 }, (_, j) => {
    const x = round(4 + j * 0.2, 1);
    return { draw, x, p: round(phi((x - mu) / sigma), 4) };
  })
);

// ---------------------------------------------------------------------------
// 4b. jk pie (Piccolotto et al.)
// ---------------------------------------------------------------------------

const rng5 = mulberry32(980_5);

/** Observed counts over three categories. */
export const pieCounts = { A: 7, B: 5, C: 3 };

/** By hand today: 20 posterior draws of the category probabilities from
 *  Dirichlet(1 + counts). Long table, one row per (draw, category). */
export const pieDraws = Array.from({ length: 20 }, (_, draw) => {
  const g = Object.values(pieCounts).map((c) => gamma(rng5, c + 1));
  const total = g.reduce((s, x) => s + x, 0);
  return Object.keys(pieCounts).map((category, k) => ({
    draw,
    category,
    p: round(g[k] / total, 4),
  }));
}).flat();

// ---------------------------------------------------------------------------
// 5. Probit-scaled CCDF for ordinal outcomes (Sarma)
// ---------------------------------------------------------------------------

const rng6 = mulberry32(980_6);

/** By hand today: 40 posterior draws of a cumulative-probit model with two
 *  conditions. Latent y* ~ Normal(μ_c, 1), thresholds τ1..τ4 shared across
 *  conditions in each draw. Then Φ⁻¹ P(y ≥ k) = μ_c − τ_{k−1} for k = 2..5
 *  (k = 1 gives P = 1, which is +∞ on the probit scale). Long table, one row
 *  per (condition, draw, k). */
export const ccdfDraws = (() => {
  const tau = [-1.2, -0.3, 0.5, 1.4];
  const mu = { Control: 0.05, Treatment: 0.55 };
  const out: {
    condition: string;
    draw: number;
    line: string;
    k: number;
    z: number;
  }[] = [];
  for (let draw = 0; draw < 40; draw++) {
    const t = tau.map((x) => x + 0.09 * normal(rng6));
    for (const [condition, m] of Object.entries(mu)) {
      const md = m + 0.12 * normal(rng6);
      for (let k = 2; k <= 5; k++)
        out.push({
          condition,
          draw,
          line: `${condition}-${draw}`,
          k,
          z: round(md - t[k - 2]),
        });
    }
  }
  return out;
})();

/** The reference line at Φ⁻¹(0.5) = 0, across the rating levels. */
export const probitZero = [
  { k: 2, z: 0 },
  { k: 5, z: 0 },
];
