// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Dist` family: distributions (#980, stack profiles). `lib.ts` binds
 * this module as `Dist` (`Dist.normal({ mean: 0, sd: 1 })`), and
 * `gofish-graphics/dist` exports the same module.
 *
 * A family (`normal`, `lognormal`, `uniform`, `exponential`) is an
 * expression a spec holds: each parameter is a number, a column whose value
 * is one number in each group, or a value expression, and its members
 * (`d.density()`, `d.support()`, `d.median()`) are channels
 * (ast/distExpr.ts). Its wire form is data, so it crosses the Python
 * bridge.
 *
 * `sample(xs)` is a distribution at run time, the record a `reduce` returns
 * (`field("x").reduce((xs) => Dist.sample(xs, { bandwidth: 2 }))`), which
 * the reduce lifts by its shape. `field("x").density()` is the same sample
 * with the default bandwidth. `units(variable, mass)` is the unit option
 * of such a reduce.
 *
 * The record and its members are defined in ast/dist.ts.
 */
import {
  densityUnit,
  sample as sampleDist,
  type Dist as DistRecord,
} from "../ast/dist";
import { RATIO } from "../ast/measure";
import { distExpr, type DistExpr, type DistParam } from "../ast/distExpr";
import type { HasUnit } from "../ast/schema";

/** What a distribution answers: its density, cdf, quantile, median, mean,
 *  support and mass. See ast/dist.ts. */
export type Dist = DistRecord;

export type { DistExpr, DistParam };

/** The normal distribution with mean `mean` and standard deviation `sd`,
 *  drawn between its 0.001 and 0.999 quantiles. */
export const normal = (params: { mean: DistParam; sd: DistParam }): DistExpr =>
  distExpr("normal", params);

/** The lognormal distribution: `exp` of a normal with mean `meanlog` and
 *  standard deviation `sdlog`. Drawn from 0 to its 0.999 quantile. */
export const lognormal = (params: {
  meanlog: DistParam;
  sdlog: DistParam;
}): DistExpr => distExpr("lognormal", params);

/** The uniform distribution from `min` to `max`. */
export const uniform = (params: { min: DistParam; max: DistParam }): DistExpr =>
  distExpr("uniform", params);

/** The exponential distribution with rate `rate` (mean `1 / rate`), drawn
 *  from 0 to its 0.999 quantile. */
export const exponential = (params: { rate: DistParam }): DistExpr =>
  distExpr("exponential", params);

/**
 * The distribution of a sample of values, as R's distributional package
 * holds one (`dist_sample`). Its quantiles, median and mean are the
 * values' own (type-7 quantiles, as `field(x).median()`). Its density is a
 * normal kernel density with area the number of values, drawn from 3
 * bandwidths below the least value to 3 above the greatest, so it tapers
 * to near zero at both ends; `bandwidth` is the kernel's standard
 * deviation, Silverman's rule (R's `bw.nrd0`) when omitted. Missing values
 * are left out.
 */
export const sample = (
  values: readonly unknown[],
  options?: { bandwidth?: number }
): Dist => sampleDist(values, options);

/** A unit as `units` takes it: its name, or a unit definition. */
type UnitArg = string | { readonly type: { readonly HasUnit?: HasUnit } };

const hasUnit = (u: UnitArg, where: string): HasUnit => {
  if (typeof u === "string") return { unit: u, symbol: u };
  const h = u?.type?.HasUnit;
  if (h === undefined)
    throw new Error(
      `${where}: give a unit's name or a Unit, got ${String(u)}.`
    );
  return h;
};

/**
 * The `unit` option of a reduce that returns a {@link Dist} over amounts in
 * `variable`, with its mass in `mass` (a count for a sample): the support,
 * the quantiles, the median and the mean are in `variable`; the density is
 * `mass` per `variable`, which adds up; the cdf is a ratio.
 */
export function units(variable: UnitArg, mass: UnitArg) {
  const v = { HasUnit: hasUnit(variable, "Dist.units(variable)") };
  const m = { HasUnit: hasUnit(mass, "Dist.units(mass)") };
  return {
    density: { HasUnit: densityUnit(v.HasUnit, m.HasUnit) },
    cdf: { HasUnit: RATIO },
    quantile: v,
    median: v,
    mean: v,
    support: v,
    mass: m,
  };
}
