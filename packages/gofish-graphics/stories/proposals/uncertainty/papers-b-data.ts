/**
 * Precomputed data for the "Papers B" uncertainty prototypes (#980). Every
 * draw, depth, quantile and density here is computed by hand with a seeded RNG,
 * because GoFish has no distribution type yet. The stories only read the
 * tables below.
 */

// ---------------------------------------------------------------------------
// Seeded RNG: mulberry32 plus a Box–Muller normal.
// ---------------------------------------------------------------------------

export const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const normalRng = (rand: () => number) => () => {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const quantile = (sorted: number[], p: number) => {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

const normPdf = (x: number, mu: number, sd: number) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** The standard normal CDF (Abramowitz and Stegun 7.1.26). */
const normCdf = (z: number) => {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
};

// ---------------------------------------------------------------------------
// 1. A curve ensemble: 50 smooth random curves (shared draws), plus their
//    pointwise quantiles and their modified band depth.
// ---------------------------------------------------------------------------

const N_CURVES = 50;
const XS = Array.from({ length: 41 }, (_, i) => i / 40);

const curveValues: number[][] = (() => {
  const rand = mulberry32(980);
  const z = normalRng(rand);
  return Array.from({ length: N_CURVES }, (_, c) => {
    const level = 0.6 * z();
    const slope = 0.6 * z();
    const a = [1, 2, 3].map((k) => (0.5 * z()) / k);
    const b = [1, 2, 3].map((k) => (0.5 * z()) / k);
    // Three planted outliers: one that jumps up after x = 0.5, two with a
    // fast wiggle.
    const jump = c === 7 ? 4.5 : 0;
    const wiggle = c === 19 || c === 33 ? 1.2 : 0;
    return XS.map(
      (x) =>
        Math.sin(2 * Math.PI * x) +
        level +
        slope * (x - 0.5) +
        [1, 2, 3].reduce(
          (s, k, i) =>
            s +
            a[i] * Math.sin(2 * Math.PI * k * x) +
            b[i] * Math.cos(2 * Math.PI * k * x),
          0
        ) +
        jump / (1 + Math.exp(-30 * (x - 0.6))) +
        wiggle * Math.sin(2 * Math.PI * 6 * x)
    );
  });
})();

/** Modified band depth (López-Pintado and Romo 2009, J = 2): the mean, over
 *  all pairs of curves, of the share of x where a curve lies inside the pair's
 *  band. */
const bandDepth: number[] = curveValues.map((f) => {
  let total = 0;
  let pairs = 0;
  for (let j = 0; j < N_CURVES; j++) {
    for (let k = j + 1; k < N_CURVES; k++) {
      const g = curveValues[j];
      const h = curveValues[k];
      let inside = 0;
      for (let t = 0; t < XS.length; t++) {
        if (f[t] >= Math.min(g[t], h[t]) && f[t] <= Math.max(g[t], h[t])) {
          inside++;
        }
      }
      total += inside / XS.length;
      pairs++;
    }
  }
  return total / pairs;
});

const depthRank = bandDepth
  .map((d, c) => ({ d, c }))
  .sort((p, q) => q.d - p.d)
  .map(({ c }) => c);
const deepest = depthRank[0];
const central = new Set(depthRank.slice(0, N_CURVES / 2));

// Functional boxplot outliers (Sun and Genton): outside the 50% band
// inflated by 1.5 times its range at some x.
const centralEnvelope = XS.map((_, t) => {
  const vs = [...central].map((c) => curveValues[c][t]);
  return { lo: Math.min(...vs), hi: Math.max(...vs) };
});
const isOutlier = (c: number) =>
  curveValues[c].some((v, t) => {
    const { lo, hi } = centralEnvelope[t];
    const r = 1.5 * (hi - lo);
    return v < lo - r || v > hi + r;
  });

/** One row per (curve, x): `{ curve, x, y, depth, role }`. `role` is
 *  "outlier", "median" (the deepest curve) or "member". */
export const curveDraws = curveValues.flatMap((ys, c) =>
  ys.map((y, t) => ({
    curve: c,
    x: XS[t],
    y,
    depth: bandDepth[c],
    role: isOutlier(c) ? "outlier" : c === deepest ? "median" : "member",
  }))
);

/** The deepest curve (the functional median) and the outlier curves, as
 *  their own tables. */
export const depthMedian = curveDraws.filter((d) => d.role === "median");
export const depthOutliers = curveDraws.filter((d) => d.role === "outlier");

/** Pointwise quantile bands, one row per (level, x): `{ level, x, lo, hi }`. */
export const pointwiseBands = [0.9, 0.5].flatMap((level) =>
  XS.map((x, t) => {
    const vs = curveValues.map((ys) => ys[t]).sort((p, q) => p - q);
    return {
      level: `${level * 100}%`,
      x,
      lo: quantile(vs, (1 - level) / 2),
      hi: quantile(vs, (1 + level) / 2),
    };
  })
);

/** The pointwise median, one row per x. */
export const pointwiseMedian = XS.map((x, t) => ({
  x,
  y: quantile(
    curveValues.map((ys) => ys[t]).sort((p, q) => p - q),
    0.5
  ),
}));

/** The depth bands, one row per (band, x): the 50% band is the envelope of the
 *  deepest half of the curves, and the outer band is that band inflated by
 *  1.5 times its range, clipped to the non-outlier curves (the whiskers of a
 *  functional boxplot). */
export const depthBands = [
  ...XS.map((x, t) => {
    const vs = curveValues
      .filter((_, c) => !isOutlier(c))
      .map((ys) => ys[t]);
    return {
      level: "max non-outlier",
      x,
      lo: Math.min(...vs),
      hi: Math.max(...vs),
    };
  }),
  ...XS.map((x, t) => ({ level: "50%", x, ...centralEnvelope[t] })),
];

// ---------------------------------------------------------------------------
// 2. Correlated field draws: 10 draws of a 20 by 20 field. Each draw is
//    smoothed white noise plus one shared random offset inside a planted
//    ellipse, so cells in the ellipse rise and fall together across draws.
// ---------------------------------------------------------------------------

const GRID = 20;
const N_FIELDS = 10;

/** How far a cell is inside the planted ellipse: 1 in the middle, falling
 *  smoothly to 0 just past its edge. */
const inEllipse = (i: number, j: number) => {
  const r = Math.sqrt(((i - 12.5) / 4.5) ** 2 + ((j - 7) / 2.8) ** 2);
  return 1 / (1 + Math.exp(8 * (r - 1)));
};

export const fieldDraws = (() => {
  const rand = mulberry32(1997);
  const z = normalRng(rand);
  const rows: {
    draw: number;
    row: number;
    col: number;
    i: number;
    j: number;
    value: number;
  }[] = [];
  for (let d = 0; d < N_FIELDS; d++) {
    const noise = Array.from({ length: GRID }, () =>
      Array.from({ length: GRID }, () => z())
    );
    const offset = 1.8 * z();
    // A Gaussian blur with sigma 1.5 cells, renormalized at the edges.
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        let s = 0;
        let w = 0;
        for (let a = 0; a < GRID; a++) {
          for (let b = 0; b < GRID; b++) {
            const k = Math.exp(-((a - i) ** 2 + (b - j) ** 2) / (2 * 1.5 ** 2));
            s += k * noise[a][b];
            w += k;
          }
        }
        // Scale the blurred noise back to unit-ish variance.
        const smooth = (s / w) * 3.2;
        rows.push({
          draw: d,
          row: Math.floor(d / 5),
          col: d % 5,
          i,
          j,
          value: smooth + inEllipse(i, j) * offset,
        });
      }
    }
  }
  return rows;
})();

// ---------------------------------------------------------------------------
// 3. Three normal densities with different standard deviations, on a grid,
//    two ways: equal area (one shared density scale), and each curve rescaled
//    to the tallest curve's peak.
// ---------------------------------------------------------------------------

const DENSITIES = [
  { curve: "A (sd 0.6)", mean: -1.5, sd: 0.6 },
  { curve: "B (sd 1)", mean: 0.5, sd: 1 },
  { curve: "C (sd 1.8)", mean: 2, sd: 1.8 },
];
const DXS = Array.from({ length: 241 }, (_, i) => -5 + (12 * i) / 240);
const tallest = Math.max(...DENSITIES.map(({ sd }) => normPdf(0, 0, sd)));

/** One row per (curve, x): `{ curve, x, density }`, the true densities. */
export const equalArea = DENSITIES.flatMap(({ curve, mean, sd }) =>
  DXS.map((x) => ({ curve, x, density: normPdf(x, mean, sd) }))
);

/** The same rows with each curve rescaled to the tallest curve's peak. */
export const equalPeak = DENSITIES.flatMap(({ curve, mean, sd }) =>
  DXS.map((x) => ({
    curve,
    x,
    density: (normPdf(x, mean, sd) * tallest) / normPdf(mean, mean, sd),
  }))
);

// ---------------------------------------------------------------------------
// 4. A day of activities with uncertain start and end times (hours).
// ---------------------------------------------------------------------------

export const activities = [
  { activity: "Sleep", start: 0, startSd: 0, end: 6.75, endSd: 0.5 },
  { activity: "Breakfast", start: 7.25, startSd: 0.25, end: 8, endSd: 0.25 },
  { activity: "Commute", start: 8.25, startSd: 0.2, end: 9, endSd: 0.35 },
  { activity: "Work", start: 9.25, startSd: 0.35, end: 17, endSd: 0.75 },
  { activity: "Exercise", start: 17.75, startSd: 0.5, end: 19, endSd: 0.5 },
  { activity: "Dinner", start: 19.5, startSd: 0.4, end: 20.5, endSd: 0.4 },
  { activity: "TV", start: 21, startSd: 0.6, end: 23, endSd: 0.6 },
];

const SLICES = 12;
const clamp = (x: number) => Math.min(24, Math.max(0, x));

/** The fading bars as stepped slices. Each activity is a solid core from
 *  `start + 2 sd` to `end − 2 sd`, plus `SLICES` slices across each uncertain
 *  end. A slice's `alpha` is the chance the activity is on at the slice's
 *  middle: P(started) × P(not yet ended). */
export const activitySlices = activities.flatMap(
  ({ activity, start, startSd, end, endSd }) => {
    const on = (t: number) =>
      (startSd === 0 ? (t >= start ? 1 : 0) : normCdf((t - start) / startSd)) *
      (endSd === 0 ? (t <= end ? 1 : 0) : 1 - normCdf((t - end) / endSd));
    const ends = [
      [start - 2 * startSd, start + 2 * startSd],
      [end - 2 * endSd, end + 2 * endSd],
    ].filter(([a, b]) => b > a);
    const slices = ends.flatMap(([a, b]) =>
      Array.from({ length: SLICES }, (_, k) => {
        const x = a + ((b - a) * k) / SLICES;
        const x2 = a + ((b - a) * (k + 1)) / SLICES;
        // Each slice runs a little past the next so no seam shows between them.
        return { activity, x: clamp(x), x2: clamp(x2 + 0.04), alpha: on((x + x2) / 2) };
      })
    );
    const core = {
      activity,
      x: start + 2 * startSd,
      x2: end - 2 * endSd,
      alpha: 1,
    };
    return [core, ...slices].filter((s) => s.x2 > s.x);
  }
).map((s, slice) => ({ slice, ...s }));

/** The dashed version: each uncertain end's 95% range
 *  `[mean − 2 sd, mean + 2 sd]` as the two endpoints of a dashed line, one
 *  row per endpoint `{ activity, end, x }`, plus a solid core between them. */
export const activityEnds = activities.flatMap(
  ({ activity, start, startSd, end, endSd }) =>
    [
      { end: `${activity} start`, mean: start, sd: startSd },
      { end: `${activity} end`, mean: end, sd: endSd },
    ]
      .filter(({ sd }) => sd > 0)
      .flatMap(({ end, mean, sd }) => [
        { activity, end, x: clamp(mean - 2 * sd) },
        { activity, end, x: clamp(mean + 2 * sd) },
      ])
);
export const activityCores = activities.flatMap(
  ({ activity, start, startSd, end, endSd }) => [
    { activity, x: start + 2 * startSd },
    { activity, x: end - 2 * endSd },
  ]
);

export const activityOrder = activities.map((a) => a.activity);
