// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * Overlap strategies for `scatter`'s `overlap` option.
 *
 * A scatter places each child on the axes a field gives it and lines the
 * children up on every other ("free") axis at the scatter's `alignment`. When
 * the children are dots, many of them land on top of each other. An overlap
 * strategy takes the place of that alignment on the free axis: it moves each
 * child along the free axis, away from the alignment line, so the children no
 * longer cover each other.
 *
 * A strategy is a plain object made by a function call
 * (`Overlap.separate({ padding })`, `Overlap.noise({ randomness })`; see
 * `families/overlap.ts`). Every strategy
 * sees the children the same way: as their enclosing circles, one
 * {@link OverlapItem} each, in data order. It answers
 * with the offset of each circle's center from the alignment line
 * ({@link resolveOverlap}). Contract: a strategy moves only the free axis; it
 * returns one free-axis number per child and cannot touch the data axis, which
 * scatter alone places.
 */
import { deviation, quantile } from "d3-array";
import { lcg } from "../../util/lcg";
import type { Overlap, NoiseRandomness } from "../../families/overlap";

/** One child as an overlap strategy sees it: the pixel position of its
 *  enclosing circle's center on the data axis, and that circle's radius. */
export type OverlapItem = { at: number; r: number };

/**
 * Where the children grow from. `"middle"` grows both ways from the line.
 * `"start"` keeps every child on the line's positive side (each child's start
 * edge at or past the line), and `"end"` on its negative side.
 */
export type OverlapSide = "middle" | "start" | "end";

/** The direction a side grows in: +1 for `"start"`, -1 for `"end"`, 0 for
 *  `"middle"` (both ways). A dot's nearest allowed center is `sideSign · r`. */
export const sideSign = (side: OverlapSide): -1 | 0 | 1 =>
  side === "start" ? 1 : side === "end" ? -1 : 0;

/**
 * Run a strategy: the free-axis offset of each item's center from the
 * alignment line, in item order.
 *
 * @param pxPerUnit Pixels per data unit on the data axis, when a data scale
 *   places it; needed by an option given in data units (noise's `smoothing`).
 */
export function resolveOverlap(
  strategy: Overlap,
  items: OverlapItem[],
  side: OverlapSide,
  pxPerUnit?: number
): number[] {
  items.forEach(({ at, r }, i) => {
    if (!Number.isFinite(at) || !Number.isFinite(r))
      throw new Error(
        `[gofish] scatter overlap: child ${i} has no finite position or ` +
          `size (position ${at}, radius ${r})`
      );
  });
  switch (strategy?.kind) {
    case "separate":
      return separateOffsets(items, side, strategy.padding ?? 0);
    case "noise": {
      // The bandwidth in pixels. Silverman's rule reads the dots' own
      // positions, and the data axis is linear, so the rule in pixels is the
      // rule in data units times the scale: no data scale is needed. 0 and
      // Infinity are the same in any unit. Only another number needs the
      // scale.
      const smoothing = strategy.smoothing ?? 0;
      const bandwidthPx =
        smoothing === "silverman"
          ? silvermanBandwidth(items)
          : smoothing === 0 || smoothing === Infinity
            ? smoothing
            : smoothing * requireScale(pxPerUnit);
      return noiseOffsets(items, side, {
        randomness: strategy.randomness ?? "blue",
        bandwidthPx,
        padding: strategy.padding ?? 0,
        seed: strategy.seed ?? 0,
      });
    }
    default:
      throw new Error(
        `[gofish] scatter overlap: unknown strategy kind ` +
          `"${(strategy as { kind?: unknown })?.kind}". Make one with ` +
          `Overlap.separate(), Overlap.noise(), Overlap.sina() or Overlap.jitter().`
      );
  }
}

/** Pixels per data unit, for an option given in data units; throws when no
 *  data scale places the data axis. */
const requireScale = (pxPerUnit: number | undefined): number => {
  if (pxPerUnit === undefined)
    throw new Error(
      "[gofish] noise: `smoothing` is in data units, but no data " +
        "scale places this scatter's data axis. Drop `smoothing`, or " +
        'use Infinity or "silverman".'
    );
  return pxPerUnit;
};

/** The cell width of the broad phase: twice the largest radius plus the
 *  padding, so any two dots close enough to touch are at most one cell apart
 *  on each axis. */
const cellWidth = (items: OverlapItem[], padding: number): number => {
  let maxR = 0;
  for (const it of items) maxR = Math.max(maxR, it.r);
  return 2 * maxR + padding;
};

/**
 * The broad phase both strategies share: placed items bucketed into square
 * cells ({@link cellWidth}), each cell a list in insertion order. `separate`
 * buckets on the data axis only; `noise`'s `"blue"` also on the free axis,
 * where the placed offsets are known.
 */
class NeighborGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly found: number[][] = [];
  constructor(private readonly width: number) {}

  private cellOf(v: number): number {
    return this.width > 0 ? Math.floor(v / this.width) : 0;
  }

  /** One number per cell: `cy` stays within ±2^21. */
  private static key(cx: number, cy: number): number {
    return cx * 4194304 + cy;
  }

  /** Record item `i` as placed at data-axis `x` (and free-axis `y`). */
  insert(i: number, x: number, y = 0): void {
    const k = NeighborGrid.key(this.cellOf(x), this.cellOf(y));
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(i);
    else this.cells.set(k, [i]);
  }

  /**
   * The buckets of placed items within one cell of `x` (and of `y`, when
   * given), cell by cell in order, each in insertion order (`separate`'s
   * tie-breaking depends on it). The returned array is reused by the next
   * call.
   */
  near(x: number, y?: number): readonly number[][] {
    const found = this.found;
    found.length = 0;
    const cx = this.cellOf(x);
    const cy = y === undefined ? 0 : this.cellOf(y);
    const reach = y === undefined ? 0 : 1;
    for (let a = cx - 1; a <= cx + 1; a++)
      for (let b = cy - reach; b <= cy + reach; b++) {
        const bucket = this.cells.get(NeighborGrid.key(a, b));
        if (bucket) found.push(bucket);
      }
    return found;
  }
}

/** Below this, two intervals that touch count as touching, not overlapping. */
const EPS = 1e-6;

/**
 * The `separate` placement (Observable Plot's `dodge`, with a uniform grid as
 * the broad phase in place of Plot's interval tree).
 *
 * Items are placed one at a time in order. Each placed neighbor `j` within
 * reach rules out the free-axis interval `yj ± sqrt(dr² − dx²)`, where
 * `dr = ri + rj + padding` and `dx` is the distance between the two centers on
 * the data axis: inside it the two circles (plus padding) would overlap. The
 * item takes the free spot nearest the line: the line itself if no interval
 * covers it, else an end of the run of overlapping intervals that does. The
 * intervals are sorted and merged in one sweep, so a dot costs O(m log m) in
 * its m neighbors.
 *
 * @returns The offset of each item's center from the line, in item order.
 */
export function separateOffsets(
  items: OverlapItem[],
  side: OverlapSide,
  padding = 0
): number[] {
  const n = items.length;
  const offsets = new Array<number>(n);
  const grid = new NeighborGrid(cellWidth(items, padding));
  const sign = sideSign(side);
  const runs = new IntervalRuns();
  for (let i = 0; i < n; i++) {
    const { at, r } = items[i];
    runs.clear();
    for (const bucket of grid.near(at))
      for (const j of bucket) {
        const dx = at - items[j].at;
        const dr = r + items[j].r + padding;
        if (Math.abs(dx) >= dr) continue;
        const dy = Math.sqrt(dr * dr - dx * dx);
        runs.add(offsets[j] - dy, offsets[j] + dy);
      }
    offsets[i] = runs.nearestFree(sign * r, sign);
    grid.insert(i, at);
  }
  return offsets;
}

/**
 * The blocked intervals around one dot, as scratch buffers reused from dot to
 * dot. An interval `[lo, hi]` blocks the open range `(lo + EPS, hi − EPS)`, so
 * its ends, and a neighbor that only touches, stay free.
 */
class IntervalRuns {
  private lo = new Float64Array(16);
  private hi = new Float64Array(16);
  private order = new Int32Array(16);
  /** Merged runs, flat: start, end, start, end, ... */
  private readonly runs: number[] = [];
  private m = 0;
  private readonly byLo = (a: number, b: number) => this.lo[a] - this.lo[b];

  clear(): void {
    this.m = 0;
  }

  add(lo: number, hi: number): void {
    if (this.m === this.lo.length) {
      const grow = <T extends Float64Array | Int32Array>(a: T): T => {
        const b = new (a.constructor as new (n: number) => T)(a.length * 2);
        b.set(a);
        return b;
      };
      this.lo = grow(this.lo);
      this.hi = grow(this.hi);
      this.order = grow(this.order);
    }
    this.lo[this.m] = lo;
    this.hi[this.m] = hi;
    this.m++;
  }

  /**
   * The free spot nearest the line on the allowed side (`sign`: +1 at or
   * above `base` only, -1 at or below only, 0 either way). The candidates are
   * `base` and every interval end; the answer is the free candidate nearest
   * the line, the earliest one on a tie (`base` first, then each neighbor's
   * `lo` and `hi` in the order they were found). Freedom is tested against
   * the intervals merged into disjoint runs, by binary search.
   */
  nearestFree(base: number, sign: -1 | 0 | 1): number {
    const { lo, hi, m } = this;
    const order = this.order.subarray(0, m);
    for (let k = 0; k < m; k++) order[k] = k;
    order.sort(this.byLo);

    // Merge into runs: the union of the open ranges (lo + EPS, hi − EPS), as
    // disjoint open ranges sorted by start.
    const runs = this.runs;
    runs.length = 0;
    for (const k of order) {
      const s = lo[k] + EPS;
      const e = hi[k] - EPS;
      if (!(s < e)) continue; // blocks nothing
      const last = runs.length - 2;
      if (last >= 0 && s < runs[last + 1]) {
        if (e > runs[last + 1]) runs[last + 1] = e;
      } else runs.push(s, e);
    }
    this.base = base;
    this.sign = sign;
    this.best = NaN;
    this.bestCost = Infinity;
    this.consider(base);
    if (sign === 0 && this.bestCost === 0) return base;
    for (let k = 0; k < m; k++) {
      this.consider(lo[k]);
      this.consider(hi[k]);
    }
    // The far end of the outermost run is always free, so `best` is set.
    return this.best;
  }

  private base = 0;
  private sign: -1 | 0 | 1 = 0;
  private best = NaN;
  private bestCost = Infinity;

  /** Take `y` if it is free, allowed, and strictly nearer the line than the
   *  best so far (so the earliest candidate wins a tie). */
  private consider(y: number): void {
    const { sign, base } = this;
    const cost = sign === 0 ? Math.abs(y) : sign * y;
    if (!(cost < this.bestCost)) return;
    if (sign > 0 ? y < base - EPS : sign < 0 ? y > base + EPS : false) return;
    if (!this.isFree(y)) return;
    this.best = y;
    this.bestCost = cost;
  }

  /** Is `y` outside every run? Only the last run starting before `y` can
   *  cover it. */
  private isFree(y: number): boolean {
    const runs = this.runs;
    let a = 0;
    let b = runs.length / 2;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (runs[2 * mid] < y) a = mid + 1;
      else b = mid;
    }
    return a === 0 || !(y < runs[2 * a - 1]);
  }
}

/** How much wider than a tight column the noise outline is: room for the
 *  randomness to spread the dots out. */
const LOOSENESS = 2;

/** Candidates per dot for `"blue"` (Mitchell's best candidate). */
const BLUE_CANDIDATES = 6;

/** Grid steps per bandwidth when the bells are summed on a grid. */
const STEPS_PER_BANDWIDTH = 16;

/** Each bell is cut off this many bandwidths from its center. Past it, a bell
 *  holds less than 1e-4 of its weight. */
const TRUNCATE = 4;

/** The most grid points the bells are summed on (a cap for sub-pixel dots on a
 *  long axis; the grid gets coarser instead). */
const MAX_GRID = 1 << 20;

/**
 * The error function. Below 0.5 a Taylor series, so a small `x` keeps its
 * relative accuracy (the edge correction adds two of them for a very wide
 * bell); above, Abramowitz and Stegun 7.1.26 (absolute error under 1.5e-7).
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (a < 0.5) {
    // erf(x) = 2/√π · Σ (-1)^k x^(2k+1) / (k! (2k+1))
    const x2 = a * a;
    let term = a;
    let sum = a;
    for (let k = 1; k < 12; k++) {
      term *= -x2 / k;
      sum += term / (2 * k + 1);
    }
    return (sign * 2 * sum) / Math.sqrt(Math.PI);
  }
  const t = 1 / (1 + 0.3275911 * a);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

/**
 * Silverman's rule of thumb for a bandwidth, as R's `bw.nrd0` (ggforce's
 * `geom_sina` default): `0.9 · min(sd, IQR / 1.34) · n^(-1/5)`, over the dots'
 * positions on the data axis, in pixels. As in R, a zero IQR uses the
 * standard deviation instead. Fewer than two dots, or every dot at one value,
 * gives 0: no smoothing, so each bell is just the dot's own size (see
 * {@link noiseOutline}).
 */
export function silvermanBandwidth(items: OverlapItem[]): number {
  const n = items.length;
  if (n < 2) return 0;
  const at = (it: OverlapItem) => it.at;
  // d3's deviation divides by n − 1, and its quantile is R's default (type
  // 7), as `bw.nrd0` uses.
  const sd = deviation(items, at)!;
  const iqr = quantile(items, 0.75, at)! - quantile(items, 0.25, at)!;
  const lo = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd;
  return 0.9 * lo * Math.pow(n, -0.2);
}

/**
 * The noise outline: the half-width, in pixels, of the band each dot may move
 * in.
 *
 * Each dot adds a small bell-shaped bump (a Gaussian) centered on its
 * position, and the outline follows the sum of the bumps. A dot near `x` adds
 * a lot there, a dot farther away less, and a dot far away almost nothing. So
 * the outline follows the data: it can have several peaks, a skew, or a
 * spike.
 *
 * Let `pitch` be the mean dot diameter plus the padding. The bump is made in
 * two steps.
 *
 * 1. Where the data is: each dot is blurred by the smoothing, a bell of
 *    bandwidth `s` (`bandwidthPx`). Only this step is corrected at the ends
 *    (below), since only it spreads a dot's weight to where there is no data.
 * 2. How big each dot is: each dot is blurred again by its own footprint, a
 *    bell of bandwidth `σ_dot = pitch / √(2π)`, about four tenths of a pitch:
 *    the bell whose peak, `1 / pitch`, is as tall as one dot spread evenly
 *    over one dot width. This step is not corrected: it is the dot's size,
 *    not missing data.
 *
 * Blurring by one bell and then another is blurring by one bell whose
 * variance is the sum, so each dot's bump is one bell with
 * `σ = √(σ_dot² + s²)`.
 *
 * Let the dots' extent be the data range widened by half a pitch at each end.
 * At dot `i`, at `x`,
 *
 *     ρ = pitch · Σⱼ φσ(x − xⱼ) / M(x),   M(x) = ∫ over the extent of φs(t − x) dt
 *
 * where `φσ` is a bell normalized to weight 1, and `M ≡ 1` when `s = 0`.
 * `Σⱼ φσ` is a density estimate scaled to the dot count, so `ρ` is how many
 * dots share one dot width of the axis there. The outline is
 *
 *     half(x) = LOOSENESS · pitch/2 · max(0, ρ − 1)
 *
 * which is LOOSENESS times the half-height a tight column of those dots would
 * need, less the dot itself (so a lone dot sits on the line).
 *
 * - The edge correction: near the ends of the extent part of each smoothing
 *   bell falls outside, where no dot can be, so the sum is divided by the
 *   weight `M(x)` of the smoothing bell at `x` that lies inside the extent.
 *   (This is a box window divided by its length inside the extent, done for a
 *   bell.) With it the density estimate integrates to about the dot count for
 *   every `s`, so the cloud's total area stays about the same as the
 *   smoothing changes; only its shape changes.
 * - With no smoothing (`s = 0`, the default) the bell is the dot's own
 *   footprint and nothing is corrected, so a lone dot, at the end of the data
 *   or inside it, has `ρ = 1` and sits on the line, and `k` dots at one value
 *   have `ρ ≈ k`. The footprint is the smallest blur. With less, dots with
 *   nearly equal values would draw on top of each other.
 * - `s` = Infinity: every bell is flat over the extent, so `ρ` is the dot
 *   count over the extent length for every dot, and the outline is flat.
 *
 * The bells are summed on a grid, not dot by dot (a sum over every pair of
 * dots is O(n²)). Each dot's weight is split between its two nearest grid
 * points (linear binning, as R's `density()`), the grid is convolved with the
 * bell cut off at TRUNCATE bandwidths, and each dot reads the sum at its
 * position by linear interpolation. With STEPS_PER_BANDWIDTH grid steps per
 * bandwidth, the error is under 0.1% of a lone dot's bell. Cost: O(n log n)
 * for the sort plus O(grid · bell) for the convolution, where the grid is the
 * data range over the step and the bell has 2 · TRUNCATE · STEPS_PER_BANDWIDTH
 * taps.
 *
 * @param bandwidthPx The smoothing `s`, in pixels. Default 0: no smoothing
 *   beyond the dots' own size.
 */
export function noiseOutline(
  items: OverlapItem[],
  padding: number,
  bandwidthPx = 0
): Float64Array {
  const n = items.length;
  const half = new Float64Array(n);
  if (n === 0) return half;
  let sumR = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const it of items) {
    sumR += it.r;
    lo = Math.min(lo, it.at);
    hi = Math.max(hi, it.at);
  }
  const pitch = (2 * sumR) / n + padding;
  if (!(pitch > 0)) return half;
  const extentLo = lo - pitch / 2;
  const extentHi = hi + pitch / 2;
  // Step 2's bell, the dot's own size, and step 1's, the smoothing, composed:
  // Gaussians add variances.
  const dotSigma = pitch / Math.sqrt(2 * Math.PI);
  const sigma = Math.sqrt(dotSigma * dotSigma + bandwidthPx * bandwidthPx);
  const setHalf = (i: number, rho: number) => {
    half[i] = (LOOSENESS * pitch * Math.max(0, rho - 1)) / 2;
  };

  if (sigma === Infinity) {
    const rho = (n * pitch) / (extentHi - extentLo);
    for (let i = 0; i < n; i++) setHalf(i, rho);
    return half;
  }

  // Sum the unnormalized bells exp(−d²/2σ²) on the grid lo + k·step.
  const step = Math.max(sigma / STEPS_PER_BANDWIDTH, (hi - lo) / MAX_GRID);
  const size = Math.floor((hi - lo) / step) + 2;
  const weight = new Float64Array(size);
  for (const { at } of items) {
    const u = (at - lo) / step;
    const k = Math.min(Math.floor(u), size - 2);
    const f = u - k;
    weight[k] += 1 - f;
    weight[k + 1] += f;
  }
  const taps = Math.ceil((TRUNCATE * sigma) / step);
  // The whole bell, both sides: bell[d + taps] is its value d steps away.
  const bell = new Float64Array(2 * taps + 1);
  for (let d = -taps; d <= taps; d++)
    bell[d + taps] = Math.exp(-((d * step) ** 2) / (2 * sigma * sigma));
  const sum = new Float64Array(size);
  for (let m = 0; m < size; m++) {
    const w = weight[m];
    if (w === 0) continue;
    const a = Math.max(0, m - taps);
    const b = Math.min(size - 1, m + taps);
    for (let k = a; k <= b; k++) sum[k] += w * bell[k - m + taps];
  }

  // ρ = pitch · Σ φσ / M. `Σ φσ` is the unnormalized sum times
  // 1/(σ√(2π)). M is the weight of the smoothing bell (bandwidth s, not σ)
  // inside the extent, (erf(a) + erf(b)) / 2 with a, b ≥ 0 the distances to
  // the two ends in units of s√2 (a sum, not a difference, so a very wide
  // bell stays exact). With no smoothing toErf is Infinity and both
  // distances are at least pitch/2 > 0, so erf gives exactly 1 and M = 1.
  const norm = pitch / (sigma * Math.sqrt(2 * Math.PI));
  const toErf = 1 / (bandwidthPx * Math.SQRT2);
  for (let i = 0; i < n; i++) {
    const x = items[i].at;
    const u = (x - lo) / step;
    const k = Math.min(Math.floor(u), size - 2);
    const f = u - k;
    const s = sum[k] * (1 - f) + sum[k + 1] * f;
    const m = (erf((extentHi - x) * toErf) + erf((x - extentLo) * toErf)) / 2;
    setHalf(i, (norm * s) / m);
  }
  return half;
}

/** The base-2 van der Corput sequence: its `i`-th term (i ≥ 1), in [0, 1). */
function vanDerCorput(i: number): number {
  let q = 0;
  let bk = 0.5;
  for (let k = i; k > 0; k = Math.floor(k / 2), bk /= 2) q += (k % 2) * bk;
  return q;
}

/**
 * The noise placement: each dot's offset inside its outline
 * ({@link noiseOutline}). `u` in [-1, 1] picks where in the band; on one
 * side of the line the band runs from the dot's radius out to radius + 2·half.
 */
export function noiseOffsets(
  items: OverlapItem[],
  side: OverlapSide,
  opts: {
    randomness: NoiseRandomness;
    bandwidthPx?: number;
    padding: number;
    seed: number;
  }
): number[] {
  const { randomness, padding } = opts;
  const half = noiseOutline(items, padding, opts.bandwidthPx);
  const sign = sideSign(side);
  const place = (u: number, i: number) =>
    sign === 0 ? u * half[i] : sign * (items[i].r + (u + 1) * half[i]);
  const n = items.length;
  const out = new Array<number>(n);

  if (randomness === "quasi") {
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => items[a].at - items[b].at || a - b
    );
    order.forEach((i, rank) => {
      out[i] = place(2 * vanDerCorput(rank + 1) - 1, i);
    });
    return out;
  }

  const rand = lcg(opts.seed);
  if (randomness === "uniform") {
    for (let i = 0; i < n; i++) out[i] = place(2 * rand() - 1, i);
    return out;
  }

  // "blue": Mitchell's best candidate. Each dot, in data order, tries a few
  // seeded spots in its band and keeps the one farthest from its placed
  // neighbors. The grid buckets placed dots on both axes, so a candidate looks
  // only at the dots within one cell of it; a candidate with none that close
  // scores the cell width.
  const cell = cellWidth(items, padding);
  const grid = new NeighborGrid(cell);
  for (let i = 0; i < n; i++) {
    const { at, r } = items[i];
    let best = 0;
    let bestGap = -Infinity;
    for (let c = 0; c < BLUE_CANDIDATES; c++) {
      const y = place(2 * rand() - 1, i);
      let gap = cell;
      for (const bucket of grid.near(at, y))
        for (const j of bucket) {
          const dx = at - items[j].at;
          const dy = y - out[j];
          const g = Math.sqrt(dx * dx + dy * dy) - (r + items[j].r + padding);
          if (g < gap) gap = g;
        }
      if (gap > bestGap) {
        bestGap = gap;
        best = y;
      }
    }
    out[i] = best;
    grid.insert(i, at, best);
  }
  return out;
}
