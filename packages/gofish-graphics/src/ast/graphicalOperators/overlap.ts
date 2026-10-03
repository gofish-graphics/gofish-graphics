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
 * ({@link OverlapResolver}). The shared broad phase for "which placed children
 * are near this one" is {@link NeighborGrid}.
 */

/** `separate()`: a beeswarm. See {@link separate}. */
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

/** What a strategy may know about the data axis besides the items: its
 *  pixels per data unit, when a data scale places it. */
export type OverlapContext = { pxPerUnit?: number };

/** A strategy's placement rule: the free-axis offset of each item's center
 *  from the alignment line, in item order. Contract: a strategy moves only the
 *  free axis; it returns one free-axis number per child and cannot touch the
 *  data axis, which scatter alone places. */
export type OverlapResolver = (
  items: OverlapItem[],
  side: OverlapSide,
  ctx: OverlapContext
) => number[];

const RESOLVERS: {
  [K in OverlapStrategy["kind"]]: (
    strategy: Extract<OverlapStrategy, { kind: K }>
  ) => OverlapResolver;
} = {
  separate: (s) => (items, side) =>
    separateOffsets(items, side, s.padding ?? 0),
  jitter: (s) => (items, side, ctx) => {
    let windowPx: number | undefined;
    if (s.smoothing !== undefined) {
      if (ctx.pxPerUnit === undefined)
        throw new Error(
          "[gofish] jitter: `smoothing` is in data units, but no data scale " +
            "places this scatter's data axis. Drop `smoothing`."
        );
      windowPx = s.smoothing * ctx.pxPerUnit;
    }
    return jitterOffsets(items, side, {
      randomness: s.randomness ?? "blue",
      windowPx,
      padding: s.padding ?? 0,
      seed: s.seed ?? 0,
    });
  },
};

/** Run a strategy: the free-axis offset of each item's center from the
 *  alignment line. */
export function resolveOverlap(
  strategy: OverlapStrategy,
  items: OverlapItem[],
  side: OverlapSide,
  ctx: OverlapContext = {}
): number[] {
  const make = RESOLVERS[strategy?.kind] as
    | ((s: OverlapStrategy) => OverlapResolver)
    | undefined;
  if (make === undefined)
    throw new Error(
      `[gofish] scatter overlap: unknown strategy kind ` +
        `"${(strategy as { kind?: unknown })?.kind}". Make one with separate() ` +
        `or jitter().`
    );
  items.forEach(({ at, r }, i) => {
    if (!Number.isFinite(at) || !Number.isFinite(r))
      throw new Error(
        `[gofish] scatter overlap: child ${i} has no finite position or ` +
          `size (position ${at}, radius ${r})`
      );
  });
  return make(strategy)(items, side, ctx);
}

/**
 * The broad phase every strategy shares: placed items bucketed by data-axis
 * position into cells of a fixed width, each cell a linked list in typed
 * arrays. With a cell width of twice the largest radius plus the padding, any
 * item close enough to touch another lies in the same cell or the one beside
 * it.
 */
export class NeighborGrid {
  private readonly head = new Map<number, number>();
  private readonly tail = new Map<number, number>();
  private readonly next: Int32Array;
  private constructor(
    private readonly at: Float64Array,
    readonly cellWidth: number
  ) {
    this.next = new Int32Array(at.length).fill(-1);
  }

  /** A grid sized so neighbors that can touch are at most one cell apart. */
  static forItems(items: OverlapItem[], padding: number): NeighborGrid {
    const at = new Float64Array(items.length);
    let maxR = 0;
    items.forEach((it, i) => {
      at[i] = it.at;
      maxR = Math.max(maxR, it.r);
    });
    return new NeighborGrid(at, 2 * maxR + padding);
  }

  private cellOf(at: number): number {
    return this.cellWidth > 0 ? Math.floor(at / this.cellWidth) : 0;
  }

  /** Record item `i` as placed. Appended, so a cell is visited in the order
   *  its items were placed (`separate`'s tie-breaking depends on it). */
  insert(i: number): void {
    const cell = this.cellOf(this.at[i]);
    const last = this.tail.get(cell);
    if (last === undefined) this.head.set(cell, i);
    else this.next[last] = i;
    this.tail.set(cell, i);
  }

  /** Call `visit(j)` for each placed item within one cell of `at`. */
  forNear(at: number, visit: (j: number) => void): void {
    const cell = this.cellOf(at);
    for (let c = cell - 1; c <= cell + 1; c++)
      for (let j = this.head.get(c) ?? -1; j >= 0; j = this.next[j]) visit(j);
  }
}

/** Below this, two intervals that touch count as touching, not overlapping. */
const EPS = 1e-6;

/**
 * The beeswarm placement (Observable Plot's `dodge`, with a uniform grid as the
 * broad phase in place of Plot's interval tree).
 *
 * Items are placed one at a time in order. Each placed neighbor `j` within
 * reach rules out the free-axis interval `yj ± sqrt(dr² − dx²)`, where
 * `dr = ri + rj + padding` and `dx` is the distance between the two centers on
 * the data axis: inside it the two circles (plus padding) would overlap. The
 * candidates are the line itself and the ends of those intervals; the item
 * takes the free candidate nearest the line.
 *
 * @returns The offset of each item's center from the line, in item order.
 */
export function separateOffsets(
  items: OverlapItem[],
  side: OverlapSide,
  padding = 0
): number[] {
  const offsets = new Array<number>(items.length);
  const grid = NeighborGrid.forItems(items, padding);

  // Lower cost = nearer the line on the allowed side.
  const cost = (y: number) =>
    side === "middle" ? Math.abs(y) : side === "start" ? y : -y;

  items.forEach(({ at, r }, i) => {
    // The nearest allowed center: on the line, or a radius off it on a side.
    const base = side === "start" ? r : side === "end" ? -r : 0;
    const blocked: [number, number][] = [];
    const candidates: number[] = [base];
    grid.forNear(at, (j) => {
      const dx = at - items[j].at;
      const dr = r + items[j].r + padding;
      if (Math.abs(dx) >= dr) return;
      const dy = Math.sqrt(dr * dr - dx * dx);
      const yj = offsets[j];
      blocked.push([yj - dy, yj + dy]);
      candidates.push(yj - dy, yj + dy);
    });
    const allowed = candidates.filter((y) =>
      side === "start"
        ? y >= base - EPS
        : side === "end"
          ? y <= base + EPS
          : true
    );
    // A stable sort keeps insertion order among ties, so a tie between the
    // two sides of a neighbor goes to the side found first.
    allowed.sort((a, b) => cost(a) - cost(b));
    // The farthest end of every blocked interval is always free, so a free
    // candidate always exists.
    offsets[i] = allowed.find((y) =>
      blocked.every(([lo, hi]) => !(lo + EPS < y && y < hi - EPS))
    )!;
    grid.insert(i);
  });
  return offsets;
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

/** A seeded generator on [0, 1) with d3's `randomLcg` constants. */
function lcg(seed: number): () => number {
  const m = 4294967296;
  let s = ((Math.floor(seed) % m) + m) % m;
  return () => (s = (1664525 * s + 1013904223) % m) / m;
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
  const place = (u: number, i: number) => {
    if (side === "middle") return u * half[i];
    const away = items[i].r + (u + 1) * half[i];
    return side === "start" ? away : -away;
  };
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
  // neighbors. Placed dots are bucketed on both axes (their free-axis offset
  // is known once placed), so a candidate looks only at the dots within one
  // cell of it; a candidate with none that close scores the cell width.
  let maxR = 0;
  for (const it of items) maxR = Math.max(maxR, it.r);
  const cell = 2 * maxR + padding;
  const grid = new PlaneGrid(cell);
  for (let i = 0; i < n; i++) {
    const { at, r } = items[i];
    let best = 0;
    let bestGap = -Infinity;
    for (let c = 0; c < BLUE_CANDIDATES; c++) {
      const y = place(2 * rand() - 1, i);
      let gap = cell;
      grid.forNear(at, y, (j) => {
        const dx = at - items[j].at;
        const dy = y - out[j];
        const g = Math.sqrt(dx * dx + dy * dy) - (r + items[j].r + padding);
        if (g < gap) gap = g;
      });
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

/** Placed points bucketed into square cells on both axes, each cell a list
 *  in insertion order. Any point within one cell width of a query lies in the
 *  3×3 cells around it. */
class PlaneGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(private readonly cellWidth: number) {}
  /** One number per cell: both indices offset by 2^21 into 22 bits each. */
  private key(cx: number, cy: number): number {
    return (cx + 2097152) * 4194304 + (cy + 2097152);
  }
  private cellOf(v: number): number {
    return this.cellWidth > 0 ? Math.floor(v / this.cellWidth) : 0;
  }
  insert(i: number, x: number, y: number): void {
    const k = this.key(this.cellOf(x), this.cellOf(y));
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(i);
    else this.cells.set(k, [i]);
  }
  forNear(x: number, y: number, visit: (j: number) => void): void {
    const cx = this.cellOf(x);
    const cy = this.cellOf(y);
    for (let a = cx - 1; a <= cx + 1; a++)
      for (let b = cy - 1; b <= cy + 1; b++) {
        const bucket = this.cells.get(this.key(a, b));
        if (bucket) for (const j of bucket) visit(j);
      }
  }
}
