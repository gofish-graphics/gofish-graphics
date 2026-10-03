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
 * A strategy is a plain object made by a function call (`separate({ padding })`,
 * `jitter({ randomness })`), so it crosses the Python bridge as IR. `kind`
 * names the strategy. Every strategy sees the children the same way: as their
 * enclosing circles, one {@link OverlapItem} each, in data order. It answers
 * with the offset of each circle's center from the alignment line
 * ({@link resolveOverlap}). Contract: a strategy moves only the free axis; it
 * returns one free-axis number per child and cannot touch the data axis, which
 * scatter alone places.
 */
import { lcg } from "../../util/lcg";

/** `separate()`: dots kept apart. See {@link separate}. */
export type SeparateStrategy = { kind: "separate"; padding?: number };

/** How `jitter()` draws each dot's offset inside the outline. */
export type JitterRandomness = "blue" | "quasi" | "uniform";

/** `jitter()`: dots spread inside a density outline. See {@link jitter}. */
export type JitterStrategy = {
  kind: "jitter";
  randomness?: JitterRandomness;
  smoothing?: number;
  padding?: number;
  seed?: number;
};

/** Every built-in overlap strategy. */
export type OverlapStrategy = SeparateStrategy | JitterStrategy;

const checkPadding = (name: string, padding: number | undefined) => {
  if (padding !== undefined && !(Number.isFinite(padding) && padding >= 0))
    throw new Error(
      `[gofish] ${name}: padding must be a non-negative number, got ${padding}`
    );
};

/**
 * Keep dots apart: each dot keeps its position on the data axis and moves
 * along the free axis to the free spot nearest the alignment line, in data
 * order, so no two dots overlap. The result is a beeswarm. Shapes other than
 * circles are placed by their enclosing circle.
 *
 * The placement is Observable Plot's `dodge`. It is not named `dodge` because
 * ggplot2's `position_dodge` means grouped bars (`spread` here), and not
 * `beeswarm` because that names a family of layouts (greedy, force-directed,
 * packed). The name follows the separation constraints of constraint layout
 * (WebCoLa, VPSC).
 *
 * @param padding Pixels kept between neighboring dots. Default 0.
 */
export function separate(opts: { padding?: number } = {}): SeparateStrategy {
  const { padding } = opts;
  checkPadding("separate", padding);
  return padding === undefined
    ? { kind: "separate" }
    : { kind: "separate", padding };
}

const RANDOMNESS: readonly JitterRandomness[] = ["blue", "quasi", "uniform"];

/**
 * Jitter. Each dot keeps its position on the data axis and gets an offset on
 * the free axis inside an outline that follows how many dots share that part
 * of the data axis (see {@link jitterOutline}). Unlike `separate()`, the outline,
 * not the collisions, sets how far the dots spread, so dots may still touch.
 *
 * @param randomness How offsets are drawn inside the outline:
 *   `"blue"` (default) keeps each dot as far from its placed neighbors as it
 *   can (best of a few seeded candidates), so the cloud is even, with no
 *   clumps; `"quasi"` spreads the dots by rank with a van der Corput sequence
 *   (ggbeeswarm's quasirandom), the fastest; `"uniform"` draws seeded uniform
 *   offsets, classic jitter.
 * @param smoothing Width, in data units of the data axis, of the window that
 *   counts dots to set the outline. Omitted: one dot width. `Infinity`: a flat
 *   outline, the fixed band of classic jitter.
 * @param padding Pixels added to each dot's width when the outline is sized
 *   and, for `"blue"`, when distances are compared. Default 0.
 * @param seed Seed for `"blue"` and `"uniform"`. Default 0, so a render is the
 *   same every time.
 */
export function jitter(
  opts: {
    randomness?: JitterRandomness;
    smoothing?: number;
    padding?: number;
    seed?: number;
  } = {}
): JitterStrategy {
  const { randomness, smoothing, padding, seed } = opts;
  if (randomness !== undefined && !RANDOMNESS.includes(randomness))
    throw new Error(
      `[gofish] jitter: randomness must be one of ${RANDOMNESS.map((r) => `"${r}"`).join(", ")}, got ${JSON.stringify(randomness)}`
    );
  if (
    smoothing !== undefined &&
    !(typeof smoothing === "number" && smoothing > 0)
  )
    throw new Error(
      `[gofish] jitter: smoothing must be a positive number of data units (or Infinity), got ${smoothing}`
    );
  checkPadding("jitter", padding);
  if (seed !== undefined && !Number.isFinite(seed))
    throw new Error(`[gofish] jitter: seed must be a number, got ${seed}`);
  const out: JitterStrategy = { kind: "jitter" };
  if (randomness !== undefined) out.randomness = randomness;
  if (smoothing !== undefined) out.smoothing = smoothing;
  if (padding !== undefined) out.padding = padding;
  if (seed !== undefined) out.seed = seed;
  return out;
}

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
 *   places it; needed by an option given in data units (jitter's `smoothing`).
 */
export function resolveOverlap(
  strategy: OverlapStrategy,
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
    case "jitter": {
      let windowPx: number | undefined;
      if (strategy.smoothing !== undefined) {
        if (pxPerUnit === undefined)
          throw new Error(
            "[gofish] jitter: `smoothing` is in data units, but no data " +
              "scale places this scatter's data axis. Drop `smoothing`."
          );
        windowPx = strategy.smoothing * pxPerUnit;
      }
      return jitterOffsets(items, side, {
        randomness: strategy.randomness ?? "blue",
        windowPx,
        padding: strategy.padding ?? 0,
        seed: strategy.seed ?? 0,
      });
    }
    default:
      throw new Error(
        `[gofish] scatter overlap: unknown strategy kind ` +
          `"${(strategy as { kind?: unknown })?.kind}". Make one with ` +
          `separate() or jitter().`
      );
  }
}

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
 * buckets on the data axis only; `jitter`'s `"blue"` also on the free axis,
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

/** How much wider than a tight column the jitter outline is: room for the
 *  randomness to spread the dots out. */
const LOOSENESS = 2;

/** Candidates per dot for `"blue"` (Mitchell's best candidate). */
const BLUE_CANDIDATES = 6;

/**
 * The jitter outline: the half-width, in pixels, of the band each dot may
 * move in.
 *
 * Let `pitch` be the mean dot diameter plus the padding, and the dots' extent
 * the data range widened by half a pitch at each end. For dot `i` at `x`, count
 * the dots `c` within the window `[x − w/2, x + w/2]` and divide by the length
 * `len` of that window inside the extent. `ρ = c · pitch / len` is how many
 * dots share one dot width of the axis there. The outline is
 *
 *     half(x) = LOOSENESS · pitch/2 · max(0, ρ − 1)
 *
 * which is LOOSENESS times the half-height a tight column of those dots would
 * need, less the dot itself (so a lone dot sits on the line).
 *
 * - `w` = one pitch (the default): `len` is one pitch, so `ρ` is the raw count
 *   of dots within one dot width. This is the dot-resolution outline.
 * - A larger `w` only smooths the outline. `c / len` is a box-kernel density
 *   estimate scaled to the dot count, and it integrates to the dot count for
 *   every `w` (dividing by the clipped `len` corrects the edges), so the
 *   cloud's total area stays about the same; only its shape changes.
 * - `w` = Infinity: every window holds all `n` dots over the whole extent, so
 *   `ρ` is the same for every dot and the outline is flat.
 * - A `w` below one pitch counts as one pitch.
 *
 * Counted with a sorted sliding window: O(n log n).
 */
export function jitterOutline(
  items: OverlapItem[],
  padding: number,
  windowPx?: number
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
  const w = Math.max(windowPx ?? pitch, pitch);
  const extentLo = lo - pitch / 2;
  const extentHi = hi + pitch / 2;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => items[a].at - items[b].at
  );
  let first = 0;
  let last = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const x = items[i].at;
    while (last < n && items[order[last]].at <= x + w / 2 + EPS) last++;
    while (items[order[first]].at < x - w / 2 - EPS) first++;
    const len = Math.min(x + w / 2, extentHi) - Math.max(x - w / 2, extentLo);
    const rho = ((last - first) * pitch) / len;
    half[i] = (LOOSENESS * pitch * Math.max(0, rho - 1)) / 2;
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
 * The jitter placement: each dot's offset inside its outline
 * ({@link jitterOutline}). `u` in [-1, 1] picks where in the band; on one
 * side of the line the band runs from the dot's radius out to radius + 2·half.
 */
export function jitterOffsets(
  items: OverlapItem[],
  side: OverlapSide,
  opts: {
    randomness: JitterRandomness;
    windowPx?: number;
    padding: number;
    seed: number;
  }
): number[] {
  const { randomness, padding } = opts;
  const half = jitterOutline(items, padding, opts.windowPx);
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
