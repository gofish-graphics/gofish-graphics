/**
 * `quantileRows`: a data helper, for use inside `derive`, that turns the grid
 * rows of a drawn density curve (`{ x, pdf }`) into `n` rows at the curve's
 * quantiles, so `Bin.quantiles` and `field(x).median()` over them read the
 * curve and not the grid.
 *
 * A declared shortcut: a first-class distribution (#980) that `Bin.quantiles`
 * and `median` read directly would replace it. It lives in data prep, so
 * removing it takes nothing away from the core API.
 */

/** The options of {@link quantileRows}. */
export type QuantileRowsOptions = {
  /** The column of the grid's positions. */
  x: string;
  /** The column of the density at each position: a finite number, 0 or
   *  more. It need not integrate to 1. */
  density: string;
  /** How many rows to make: a whole number, 1 or more. */
  n: number;
};

/**
 * `n` rows at the quantiles of the density that `rows` sample, one at each
 * probability `(i + 0.5) / n`. The rows are a grid of one curve: each holds a
 * position `x`, no two the same, and the density there, in any order. The density is taken to
 * be linear between grid points, integrated by the trapezoid rule to a
 * cumulative distribution, and each quantile is read off it by linear
 * interpolation.
 *
 * Each row made holds `x` and every other column whose value is the same in
 * all of `rows` (a group's `month`), so a split after it still sees them.
 * Columns that vary, the density among them, are dropped.
 *
 * A shortcut until first-class distributions (#980) replace it.
 */
export function quantileRows(
  rows: readonly Record<string, unknown>[],
  { x, density, n }: QuantileRowsOptions
): Record<string, unknown>[] {
  const where = "quantileRows(...)";
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${where}: n must be a whole number, 1 or more, got ${n}.`);
  const grid = rows
    .map((r) => {
      const at = r[x];
      const d = r[density];
      if (typeof at !== "number" || !Number.isFinite(at))
        throw new Error(
          `${where}: the column "${x}" must hold finite numbers, got ${String(at)}.`
        );
      if (typeof d !== "number" || !Number.isFinite(d) || d < 0)
        throw new Error(
          `${where}: the column "${density}" must hold finite numbers, 0 or ` +
            `more, got ${String(d)}.`
        );
      return [at, d] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  // A grid has one density at each position: two rows at one position are
  // two curves mixed together.
  for (let i = 1; i < grid.length; i++)
    if (grid[i][0] === grid[i - 1][0])
      throw new Error(
        `${where}: two rows have "${x}" ${grid[i][0]}, so these rows hold ` +
          `more than one curve. Call quantileRows on each curve's rows: ` +
          `inside derive, after the flow splits the curves apart.`
      );
  // The cumulative area at each grid point (trapezoid rule).
  const cdf = [0];
  for (let i = 1; i < grid.length; i++)
    cdf.push(
      cdf[i - 1] +
        ((grid[i][0] - grid[i - 1][0]) * (grid[i][1] + grid[i - 1][1])) / 2
    );
  const total = cdf[cdf.length - 1];
  if (!(total > 0))
    throw new Error(
      `${where}: the density "${density}" has no area over "${x}", so it has ` +
        `no quantiles. It needs two or more grid points with some density.`
    );
  const constant = constantColumns(rows, [x, density]);
  const out: Record<string, unknown>[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = ((i + 0.5) / n) * total;
    while (cdf[j + 1] < target) j++;
    const span = cdf[j + 1] - cdf[j];
    const t = span > 0 ? (target - cdf[j]) / span : 0;
    out.push({
      ...constant,
      [x]: grid[j][0] + t * (grid[j + 1][0] - grid[j][0]),
    });
  }
  return out;
}

/** The columns of `rows` (but `skip`) whose value is the same in every row,
 *  with that value. */
function constantColumns(
  rows: readonly Record<string, unknown>[],
  skip: readonly string[]
): Record<string, unknown> {
  const first = rows[0] ?? {};
  return Object.fromEntries(
    Object.entries(first).filter(
      ([k, v]) => !skip.includes(k) && rows.every((r) => Object.is(r[k], v))
    )
  );
}
