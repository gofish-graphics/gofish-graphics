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
 * (`d.density()`, `d.domain()`, `d.median()`) are channels
 * (ast/distExpr.ts). Its wire form is data, so it crosses the Python
 * bridge.
 *
 * A distribution of a sample is not a family: `derive(kde(x))` smooths a
 * group's values into a distribution the column holds, and `field(x)`'s
 * members read it (`kde` in ast/marks/chart.ts).
 *
 * The record and its members are defined in ast/dist.ts.
 */
import type { Dist as DistRecord } from "../ast/dist";
import { distExpr, type DistExpr, type DistParam } from "../ast/distExpr";

/** What a distribution answers: its density, cdf, quantile, median, mean,
 *  domain and mass. See ast/dist.ts. */
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
