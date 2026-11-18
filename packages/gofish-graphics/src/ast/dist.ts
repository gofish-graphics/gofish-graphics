// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Distributions at run time: what the engine asks a distribution, as one
 * record ({@link Dist}), and the data form a column holds one in
 * ({@link DistData}).
 *
 * A `Dist` is one self-consistent distribution, a plain record of numbers
 * and functions (`fun.ts`). Its members:
 *
 * - `density`: the mass times the probability density, over the interval
 *   it is drawn over (below).
 *   For a family the mass is 1, so it is the pdf. For a kernel density it
 *   is the sum of the kernels, whose area over the whole line is the number
 *   of values, so the densities of several groups add up.
 * - `cdf`: the share of the mass at or below t, a ratio, over the same
 *   interval: the integral of the density from below, over the mass.
 * - `quantile(p)`: the value with the share p of the mass at or below it,
 *   the inverse of the cdf.
 * - `median`, the quantile at 0.5, and `mean`, the density's mean.
 * - `domain`: t itself (`identity`), over the same interval as `density`,
 *   so `ribbon({ x: d.domain(), h: d.density() })` reads both at one t. It
 *   is the interval the density is drawn over, not the distribution's
 *   support when that is unbounded.
 * - `mass`: 1 for a family, the number of values for a kernel density.
 *
 * The interval the functions run over is where the density is drawn, as
 * ggdist draws it: a family over its support, or between its 0.001 and
 * 0.999 quantiles at an end where the support is unbounded; a kernel
 * density from three bandwidths below its least value to three above its
 * greatest (seaborn's `cut=3`), so it tapers to near zero at both ends.
 *
 * A cell of a partition is the Dist restricted to the cell
 * ({@link restrictDist}): the same density inside, the cell's share of the
 * mass.
 */
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
import { COUNT, PROBABILITY, RATIO, type Quantity } from "./measure";
import type { HasUnit } from "./schema";

/** What a distribution answers. See the module comment. */
export type Dist = {
  readonly density: Fun<number>;
  readonly cdf: Fun<number>;
  quantile(p: number): number;
  readonly median: number;
  readonly mean: number;
  readonly domain: Fun<number>;
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
    domain: identity(o.domain),
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
        domain: identity(domain),
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
// Kernel densities.

/** How far from a value its kernel reaches, in bandwidths: past it the
 *  normal density is below 1e-14 of its peak, and the normal cdf within
 *  1e-15 of 0 or 1. */
const KERNEL_REACH = 8;

/** How far past its least and greatest value a kernel density is drawn,
 *  in bandwidths (seaborn's `cut=3`). The cells at the two ends of the drawn
 *  interval hold the kernels' tails past it ({@link restrictDist}).
 *  TODO(#1371): an option of `kde` could choose how far past the values it
 *  runs, and a bounded estimator (reflection at a hard limit, such as 0 for
 *  counts) for values that cannot go past one. */
const KDE_CUT = 3;

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

/** The finite values of `values`, ascending, missing ones (null,
 *  undefined) aside; any other value is an error. */
function sortedValues(values: readonly unknown[], where: string): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new Error(
        `${where}: a kernel density's values are finite numbers, but one ` +
          `is ${JSON.stringify(v)}.`
      );
    out.push(v);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The kernel density of `values` as one distribution: a normal kernel of
 * standard deviation `bandwidth` on each value (Silverman's rule, R's
 * `bw.nrd0`, when omitted). Its density is the sum of the kernels, with
 * area the number of values over the whole line; its cdf is that sum's
 * integral over the number of values, the mean of the kernels' cdfs; its
 * quantile inverts the cdf; its mean is the values' mean, the kernels'
 * center of mass. It is drawn from {@link KDE_CUT} bandwidths below the
 * least value to as many above the greatest. Missing values are left out.
 */
function kernelDist(values: readonly unknown[], bandwidth?: number): Dist {
  const where = "kde";
  const xs = sortedValues(values, where);
  const n = xs.length;
  if (bandwidth !== undefined) positive(where, "bandwidth", bandwidth);
  const bw = bandwidth ?? silvermanBandwidth(xs);
  if (n === 0 || !(bw > 0))
    throw new Error(
      `${where}: Silverman's rule gives no bandwidth for ` +
        `${n === 0 ? "no values" : `the values ${n === 1 ? xs[0] : `all ${xs[0]}`}`}` +
        `: it needs two different values. Give one: kde(column, { bandwidth }).`
    );
  const domain = { min: xs[0] - KDE_CUT * bw, max: xs[n - 1] + KDE_CUT * bw };
  const reach = KERNEL_REACH * bw;
  // The kernels near t, past which each adds nothing to the density and
  // all or nothing to the cdf.
  const near = (t: number, each: (z: number) => number): number => {
    let s = 0;
    for (let i = lowerBound(xs, t - reach); i < n && xs[i] <= t + reach; i++)
      s += each((t - xs[i]) / bw);
    return s;
  };
  const densityAt = (t: number) => near(t, phi) / bw;
  const cdfAt = (t: number) =>
    (lowerBound(xs, t - reach) + near(t, normalCdf)) / n;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const quantile = (p: number): number => {
    if (!(p >= 0 && p <= 1))
      throw new Error(`quantile: p must be in [0, 1], got ${p}.`);
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    // Newton's method on the cdf, whose slope is the density over the
    // mass, kept inside a bracket that halves when a step leaves it.
    let lo = xs[0] - reach;
    let hi = xs[n - 1] + reach;
    let t = Math.min(hi, Math.max(lo, mean));
    for (let k = 0; k < 200; k++) {
      const e = cdfAt(t) - p;
      if (e === 0) return t;
      if (e < 0) lo = t;
      else hi = t;
      const step = t - (e * n) / Math.max(densityAt(t), 1e-300);
      t = step > lo && step < hi ? step : (lo + hi) / 2;
      if (hi - lo <= 1e-12 * Math.max(1, Math.abs(t))) break;
    }
    return t;
  };
  return {
    density: opaque(densityAt, { domain }),
    cdf: opaque(cdfAt, { domain }),
    quantile,
    median: quantile(0.5),
    mean,
    domain: identity(domain),
    mass: n,
  };
}

// ---------------------------------------------------------------------------
// The data form.

/**
 * A distribution as data holds it, a value a column can hold: a plain
 * tagged record, so it crosses to and from Python as data.
 *
 * - A family with its parameters given: `{ type: "dist", family: "normal",
 *   params: { mean: 0, sd: 1 } }`, the wire form of `Dist.normal(...)` with
 *   numbers for its parameters.
 * - A kernel density, what `kde` makes: `{ type: "dist", family: "kde",
 *   params: { values, bandwidth? } }`, the values it smooths and, when the
 *   spec gives one, the bandwidth.
 *
 * {@link distOf} turns it into the run-time {@link Dist}.
 */
export type DistData =
  | {
      readonly type: "dist";
      readonly family: FamilyName;
      readonly params: Readonly<Record<string, number>>;
    }
  | {
      readonly type: "dist";
      readonly family: "kde";
      readonly params: {
        readonly values: readonly unknown[];
        readonly bandwidth?: number;
      };
    };

/** Whether `v` is a distribution as data holds it ({@link DistData}). */
export const isDistData = (v: unknown): v is DistData =>
  typeof v === "object" &&
  v !== null &&
  (v as any).type === "dist" &&
  typeof (v as any).family === "string" &&
  typeof (v as any).params === "object" &&
  (v as any).params !== null &&
  (v as any).ops === undefined;

/** Each data form's Dist, built once. */
const built = new WeakMap<object, Dist>();

/** The run-time {@link Dist} of a distribution's data form: the one place
 *  a Dist is built. */
export function distOf(data: DistData): Dist {
  let d = built.get(data);
  if (d === undefined) {
    d =
      data.family === "kde"
        ? kernelDist(
            (data.params as { values: readonly unknown[] }).values ?? [],
            (data.params as { bandwidth?: number }).bandwidth
          )
        : familyDist(
            data.family,
            data.params as FamilyParams<typeof data.family>
          );
    built.set(data, d);
  }
  return d;
}

/** The quantity of a distribution's mass: the number of values for a
 *  kernel density, a probability for a family. */
export const massQuantity = (family: DistData["family"]): Quantity =>
  family === "kde"
    ? { name: "count", unit: COUNT }
    : { name: "probability", unit: PROBABILITY };

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
  const drawn = d.domain.domain;
  const domain = meet(drawn, cell);
  // A distribution is drawn over less than its support (a family from its
  // 0.001 to its 0.999 quantile, a kernel density to three bandwidths past
  // its values), so a cell at an end of the drawn interval holds the tail
  // past it too: the cells share all of the mass.
  const below = domain.min <= drawn.min ? 0 : d.cdf.at(domain.min);
  const w = (domain.max >= drawn.max ? 1 : d.cdf.at(domain.max)) - below;
  const density = restrict(d.density, domain);
  const quantile = (p: number) => {
    if (!(p >= 0 && p <= 1))
      throw new Error(`quantile: p must be in [0, 1], got ${p}.`);
    if (!(w > 0)) return domain.min;
    const q = d.quantile(below + p * w);
    return Math.min(domain.max, Math.max(domain.min, q));
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
    domain: identity(domain),
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
 *  mass in `mass`: the domain, the quantile, the median and the mean are
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
    domain: variable,
    mass,
  };
}
