// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Distributions at run time: what the engine asks a distribution, as one
 * record ({@link Dist}), and the ways to make one.
 *
 * A `Dist` is a plain record of numbers and functions (`fun.ts`). Nothing in
 * it is specific to how it is held, so a `reduce` that returns one is lifted
 * by the general rule (`Lift` in groupExpr.ts): `d.density()`,
 * `d.support()`, `d.quantile(0.9)`. Its members:
 *
 * - `density`: the mass times the probability density, over the support.
 *   For a family the mass is 1, so it is the pdf. For a sample it is a
 *   kernel density whose area is the number of values (less the kernels'
 *   tails past the support), so the densities of several groups add up.
 * - `cdf`: the share of the mass at or below t, a ratio, over the support.
 *   For a sample it is the inverse of its quantile, so it is the values'
 *   own share, not the integral of the smoothed density.
 * - `quantile(p)`: the value with the share p of the mass at or below it.
 * - `median`, `mean`.
 * - `support`: t itself (`identity`), over the same interval as `density`,
 *   so `ribbon({ x: d.support(), h: d.density() })` reads both at one t.
 * - `mass`: 1 for a family, the number of values for a sample.
 *
 * The interval the functions run over is where the density is drawn, as
 * ggdist draws it: a family over its support, or between its 0.001 and
 * 0.999 quantiles at an end where the support is unbounded; a sample from
 * three bandwidths below its least value to three above its greatest
 * (seaborn's `cut=3`), so its density tapers to near zero at both ends.
 *
 * A cell of a partition is the Dist restricted to the cell
 * ({@link restrictDist}): the same density inside, the cell's share of the
 * mass. A sample restricted to a cell is the values in the cell, with the
 * whole sample's density inside the cell ({@link sampleIn}).
 */
import { quantileSorted } from "d3-array";
import { Frontend } from "gofish-ir";
import {
  constant,
  identity,
  integrate,
  map,
  opaque,
  restrict,
  through,
  type Fun,
  type Interval,
} from "./fun";
import { silvermanBandwidth } from "./graphicalOperators/overlap";
import { RATIO, type Quantity } from "./measure";
import type { HasUnit } from "./schema";

/** What a distribution answers. See the module comment. A sample with no
 *  values (an empty cell) has no quantile, median or mean. */
export type Dist = {
  readonly density: Fun<number>;
  readonly cdf: Fun<number>;
  quantile(p: number): number | undefined;
  readonly median: number | undefined;
  readonly mean: number | undefined;
  readonly support: Fun<number>;
  readonly mass: number;
};

// ---------------------------------------------------------------------------
// The standard normal.

const LOG_SQRT_2PI = 0.9189385332046727;

/** The standard normal density. */
const phi = (z: number): number => Math.exp(-0.5 * z * z - LOG_SQRT_2PI);

/** The standard normal cdf, by Marsaglia's series ("Evaluating the Normal
 *  Distribution", 2004), to about 1e-15. */
export function normalCdf(x: number): number {
  if (x < -38) return 0;
  if (x > 38) return 1;
  let s = x;
  let t = 0;
  let b = x;
  const q = x * x;
  let i = 1;
  while (s !== t) {
    t = s;
    i += 2;
    b *= q / i;
    s = t + b;
  }
  return Math.min(1, Math.max(0, 0.5 + s * phi(x)));
}

/** The standard normal quantile: Acklam's rational approximation, then one
 *  Halley step on {@link normalCdf}. */
export function normalQuantile(p: number): number {
  if (!(p >= 0 && p <= 1))
    throw new Error(`quantile: p must be in [0, 1], got ${p}.`);
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const low = 0.02425;
  const tail = (q: number) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  let x: number;
  if (p < low) x = tail(Math.sqrt(-2 * Math.log(p)));
  else if (p > 1 - low) x = -tail(Math.sqrt(-2 * Math.log(1 - p)));
  else {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ---------------------------------------------------------------------------
// Families.

/** The share of the mass below which, and above which, a family with an
 *  unbounded support is not drawn (ggdist's `p_limits`). */
const TAIL = 0.001;

/** The parameters of each family, by name, as `Dist.normal({ mean, sd })`
 *  takes them: gofish-ir's table, which the validator reads too. */
export const FAMILY_PARAMS = Frontend.DIST_FAMILIES;

export type FamilyName = keyof typeof FAMILY_PARAMS;

/** A family's parameters, each a number. */
export type FamilyParams<F extends FamilyName> = {
  readonly [K in (typeof FAMILY_PARAMS)[F][number]]: number;
};

/** A family's Dist from its parts: the density and the cdf as formulas, the
 *  quantile, and the interval they are drawn over. */
function familyOf(o: {
  domain: Interval;
  pdf: (t: number) => number;
  cdf: (t: number) => number;
  quantile: (p: number) => number;
  median: number;
  mean: number;
}): Dist {
  const quantile = (p: number) => {
    if (!(p >= 0 && p <= 1))
      throw new Error(`quantile: p must be in [0, 1], got ${p}.`);
    return o.quantile(p);
  };
  return {
    density: opaque(o.pdf, { domain: o.domain }),
    cdf: opaque(o.cdf, { domain: o.domain }),
    quantile,
    median: o.median,
    mean: o.mean,
    support: identity(o.domain),
    mass: 1,
  };
}

const positive = (where: string, name: string, v: number) => {
  if (!(Number.isFinite(v) && v > 0))
    throw new Error(`${where}: ${name} must be a positive number, got ${v}.`);
};
const finite = (where: string, name: string, v: number) => {
  if (!Number.isFinite(v))
    throw new Error(`${where}: ${name} must be a finite number, got ${v}.`);
};

/** The Dist of the family `family` with the parameters `params`. */
export function familyDist<F extends FamilyName>(
  family: F,
  params: FamilyParams<F>
): Dist {
  const where = `Dist.${family}`;
  const p = params as unknown as Record<string, number>;
  switch (family) {
    case "normal": {
      const { mean, sd } = p;
      finite(where, "mean", mean);
      positive(where, "sd", sd);
      const q = (u: number) => mean + sd * normalQuantile(u);
      return familyOf({
        domain: { min: q(TAIL), max: q(1 - TAIL) },
        pdf: (t) => phi((t - mean) / sd) / sd,
        cdf: (t) => normalCdf((t - mean) / sd),
        quantile: q,
        median: mean,
        mean,
      });
    }
    case "lognormal": {
      const { meanlog, sdlog } = p;
      finite(where, "meanlog", meanlog);
      positive(where, "sdlog", sdlog);
      const q = (u: number) => Math.exp(meanlog + sdlog * normalQuantile(u));
      return familyOf({
        domain: { min: 0, max: q(1 - TAIL) },
        pdf: (t) =>
          t <= 0 ? 0 : phi((Math.log(t) - meanlog) / sdlog) / (sdlog * t),
        cdf: (t) => (t <= 0 ? 0 : normalCdf((Math.log(t) - meanlog) / sdlog)),
        quantile: q,
        median: Math.exp(meanlog),
        mean: Math.exp(meanlog + (sdlog * sdlog) / 2),
      });
    }
    case "uniform": {
      const { min, max } = p;
      finite(where, "min", min);
      finite(where, "max", max);
      if (!(min < max))
        throw new Error(
          `${where}: min must be less than max, got ${min} and ${max}.`
        );
      const domain = { min, max };
      const w = max - min;
      return {
        density: constant(1 / w, domain),
        cdf: through([min, max], [0, 1], { kind: "linear" }),
        quantile: (u) => {
          if (!(u >= 0 && u <= 1))
            throw new Error(`quantile: p must be in [0, 1], got ${u}.`);
          return min + u * w;
        },
        median: min + w / 2,
        mean: min + w / 2,
        support: identity(domain),
        mass: 1,
      };
    }
    case "exponential": {
      const { rate } = p;
      positive(where, "rate", rate);
      const q = (u: number) => -Math.log(1 - u) / rate;
      return familyOf({
        domain: { min: 0, max: q(1 - TAIL) },
        pdf: (t) => (t < 0 ? 0 : rate * Math.exp(-rate * t)),
        cdf: (t) => (t < 0 ? 0 : 1 - Math.exp(-rate * t)),
        quantile: q,
        median: Math.LN2 / rate,
        mean: 1 / rate,
      });
    }
  }
  throw new Error(`Dist: no family "${String(family)}".`);
}

// ---------------------------------------------------------------------------
// Samples.

/** How far from a value its kernel reaches, in bandwidths: past it the
 *  normal density is below 1e-14 of its peak. */
const KERNEL_REACH = 8;

/** How far past its least and greatest value a sample's density is drawn,
 *  in bandwidths (seaborn's `cut=3`). A kernel has the share Φ(−3) ≈
 *  0.00135 of its mass past 3 bandwidths on one side, so the area over the
 *  support is the number of values less at most that share of each
 *  extreme value's kernel at each end.
 *  TODO(stack-profiles): an option for a sample's density could choose how
 *  far past the values it runs, and a bounded estimator (reflection at a
 *  hard limit, such as 0 for counts) for values that cannot go past one. */
const SAMPLE_CUT = 3;

/** The first index of the ascending `xs` at or above `v`. */
const lowerBound = (xs: readonly number[], v: number): number => {
  let a = 0;
  let b = xs.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (xs[m] < v) a = m + 1;
    else b = m;
  }
  return a;
};

/**
 * The kernel density of the ascending `sorted` over `domain`: a normal
 * kernel of standard deviation `bw` on each value, summed, so its area over
 * the whole line is the number of values.
 */
function kernelDensity(
  sorted: readonly number[],
  domain: Interval,
  bw: number
): Fun<number> {
  const points = sorted;
  const reach = KERNEL_REACH * bw;
  return opaque(
    (t) => {
      let s = 0;
      for (
        let i = lowerBound(points, t - reach);
        i < points.length && points[i] <= t + reach;
        i++
      )
        s += phi((t - points[i]) / bw);
      return s / bw;
    },
    { domain }
  );
}

/**
 * A sample's Dist over `domain` with the density `density`: its quantile is
 * the type-7 quantile of the values (R's and numpy's default, d3's
 * `quantileSorted`), so its median is `field(...).median()`'s, and its cdf
 * is the inverse of that quantile, linear between the values, 0 below the
 * least and 1 above the greatest (over the density's tails past them).
 */
function sampleOver(
  sorted: readonly number[],
  domain: Interval,
  density: Fun<number>
): Dist {
  const n = sorted.length;
  const quantile = (p: number): number | undefined => {
    if (!(p >= 0 && p <= 1))
      throw new Error(`quantile: p must be in [0, 1], got ${p}.`);
    return n === 0 ? undefined : quantileSorted(sorted as number[], p);
  };
  // The cdf at each distinct value: the share whose type-7 quantile is the
  // last copy of it, i / (n − 1). One value has all of the mass.
  const knots: number[] = [];
  const shares: number[] = [];
  sorted.forEach((x, i) => {
    const share = n === 1 ? 1 : i / (n - 1);
    if (knots.length > 0 && knots[knots.length - 1] === x)
      shares[shares.length - 1] = share;
    else {
      knots.push(x);
      shares.push(share);
    }
  });
  if (knots.length === 0 || knots[0] > domain.min) {
    knots.unshift(domain.min);
    shares.unshift(0);
  }
  if (knots[knots.length - 1] < domain.max) {
    knots.push(domain.max);
    shares.push(1);
  }
  const cdf =
    knots.length === 1
      ? constant(shares[0], domain)
      : through(knots, shares, { kind: "linear" });
  return {
    density,
    cdf,
    quantile,
    median: quantile(0.5),
    mean: n === 0 ? undefined : sorted.reduce((a, b) => a + b, 0) / n,
    support: identity(domain),
    mass: n,
  };
}

/** The finite values of `values`, ascending, missing ones (null,
 *  undefined) aside; any other value is an error. */
function sortedValues(values: readonly unknown[], where: string): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new Error(
        `${where}: a sample's values are finite numbers, but one is ` +
          `${JSON.stringify(v)}.`
      );
    out.push(v);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The Dist of a sample of values, as R's distributional package holds one
 * (`dist_sample`): its quantiles, median and mean are the values' (type-7
 * quantiles, so they agree with `field(x).median()`), and its density is a
 * normal kernel density with the bandwidth `bandwidth` (Silverman's rule
 * when omitted, R's `bw.nrd0`), drawn from {@link SAMPLE_CUT} bandwidths
 * below the least value to as many above the greatest. Its mass is the
 * number of values, the area under the density over the whole line.
 * Missing values (null, undefined) are left out. It needs two different
 * values.
 */
export function sample(
  values: readonly unknown[],
  options?: { bandwidth?: number }
): Dist {
  const where = "Dist.sample";
  const sorted = sortedValues(values, where);
  if (options?.bandwidth !== undefined)
    positive(where, "bandwidth", options.bandwidth);
  const n = sorted.length;
  const range =
    n === 0 ? { min: 0, max: 0 } : { min: sorted[0], max: sorted[n - 1] };
  // A sample of fewer than two different values has quantiles but no
  // density: there is no spread to smooth over. Its density is an error
  // where it is read, so its quantiles, median and mean still work.
  if (n < 2 || sorted[0] === sorted[n - 1]) {
    const none = () => {
      throw new Error(
        `${where}: a density needs at least two different values, but the ` +
          `values are ${n === 0 ? "none" : `all ${sorted[0]}`}.`
      );
    };
    return sampleOver(sorted, range, opaque(none, { domain: range }));
  }
  const bw = options?.bandwidth ?? silvermanBandwidth(sorted);
  const domain = {
    min: range.min - SAMPLE_CUT * bw,
    max: range.max + SAMPLE_CUT * bw,
  };
  return sampleOver(sorted, domain, kernelDensity(sorted, domain, bw));
}

/** The sample `whole` restricted to `cell`, a cell of its values' line:
 *  the values of the cell (`values`, what a split puts in the cell), with
 *  the whole sample's density inside the cell, over the part of its
 *  interval in the cell. The values in the cell are the whole sample
 *  conditioned on being in it, so this is {@link restrictDist} for a
 *  sample, read exactly off its values.
 *
 *  The density runs past the values (its tails), and the cells of the
 *  values' line cover the values only, so a cell that reaches the least
 *  value (its 0 quantile) holds the tail below it, and one that reaches the
 *  greatest holds the tail above: the cells of one sample partition its
 *  whole support. */
export function sampleIn(
  values: readonly unknown[],
  whole: Dist,
  cell: Interval
): Dist {
  const support = whole.support.domain;
  const domain = meet(support, {
    min: cell.min <= (whole.quantile(0) ?? cell.min) ? support.min : cell.min,
    max: cell.max >= (whole.quantile(1) ?? cell.max) ? support.max : cell.max,
  });
  return sampleOver(
    sortedValues(values, "Dist.sample"),
    domain,
    restrict(whole.density, domain)
  );
}

// ---------------------------------------------------------------------------
// Restriction.

/** Where `domain` and `cell` meet; an error when they do not. */
function meet(domain: Interval, cell: Interval): Interval {
  const out = {
    min: Math.max(domain.min, cell.min),
    max: Math.min(domain.max, cell.max),
  };
  if (!(out.min <= out.max))
    throw new Error(
      `Dist: the cell [${cell.min}, ${cell.max}] does not meet the interval ` +
        `[${domain.min}, ${domain.max}] the distribution is drawn over.`
    );
  return out;
}

/**
 * `d` restricted to `cell`, what a cell of a partition holds (#980's
 * "truncated" form): the same density inside the cell, the mass the cell's
 * share w of the whole, the cdf, the quantile, the median and the mean of
 * the part in the cell. Every function member is restricted to the cell
 * with `restrict`, so the cells of one Dist meet exactly.
 */
export function restrictDist(d: Dist, cell: Interval): Dist {
  const domain = meet(d.support.domain, cell);
  const below = d.cdf.at(domain.min);
  const w = d.cdf.at(domain.max) - below;
  const density = restrict(d.density, domain);
  const quantile = (p: number) => {
    if (!(p >= 0 && p <= 1))
      throw new Error(`quantile: p must be in [0, 1], got ${p}.`);
    return w > 0 ? d.quantile(below + p * w) : domain.min;
  };
  const area = integrate(density);
  return {
    density,
    cdf: restrict(
      map(d.cdf, (c) =>
        w > 0 ? Math.min(1, Math.max(0, (c - below) / w)) : 1
      ),
      domain
    ),
    quantile,
    median: quantile(0.5),
    mean:
      area > 0
        ? integrate(opaque((t) => t * density.at(t), { domain })) / area
        : domain.min,
    support: identity(domain),
    mass: d.mass * w,
  };
}

// ---------------------------------------------------------------------------
// Units.

/** The unit of a density of mass in `mass` over a variable in `variable`:
 *  mass per unit of the variable, or per unit of a difference of two of its
 *  values (a density over times is per duration). Densities add up. */
export function densityUnit(variable: HasUnit, mass: HasUnit): HasUnit {
  const of = variable.difference ?? variable;
  return {
    unit: `${mass.unit} per ${of.unit}`,
    symbol: `${mass.symbol ?? mass.unit}/${of.symbol ?? of.unit}`,
    traits: { CanSum: {} },
  };
}

/** The quantity of each member of a Dist over the variable `variable` with
 *  mass in `mass`: the support, the quantile, the median and the mean are
 *  amounts of the variable; the density is mass per unit of it; the cdf is
 *  a ratio. A variable whose unit is not declared gives a density whose
 *  unit is not declared either. */
export function distQuantities(
  variable: Quantity,
  mass: Quantity
): Record<keyof Dist, Quantity> {
  const named = (suffix: string) =>
    variable.name !== undefined ? { name: `${variable.name} ${suffix}` } : {};
  const density: Quantity = {
    ...named("density"),
    ...(variable.unit !== undefined && mass.unit !== undefined
      ? { unit: densityUnit(variable.unit, mass.unit) }
      : {}),
  };
  return {
    density,
    cdf: { ...named("cdf"), unit: RATIO },
    quantile: variable,
    median: variable,
    mean: variable,
    support: variable,
    mass,
  };
}
