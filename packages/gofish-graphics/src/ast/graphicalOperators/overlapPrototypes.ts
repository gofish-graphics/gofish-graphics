/**
 * PROTOTYPE overlap strategies, for comparing against `swarm()`. Not exported
 * from the library, not in the IR, not in Python, not documented: the names
 * and algorithms are not approved. Each one is a `ResolverStrategy` (the
 * internal hook in `overlap.ts`), so `scatter` runs it through the same
 * overlap constraint as `swarm`: the same enclosing circles in data order, and
 * the same `NeighborGrid` broad phase where a strategy needs neighbors.
 * Delete this file (and `stories/prototypes/OverlapPrototypes.stories.tsx`)
 * to drop them, or promote one to a named, serializable strategy.
 *
 * All three take the same `width`: the largest offset from the alignment line,
 * in pixels, so their outlines are directly comparable.
 */
import {
  NeighborGrid,
  type OverlapItem,
  type OverlapSide,
  type ResolverStrategy,
} from "./overlap";

/** d3's `randomLcg` constants: a seeded generator on [0, 1). */
function lcg(seed: number): () => number {
  const m = 4294967296;
  let s = ((Math.floor(seed) % m) + m) % m;
  return () => (s = (1664525 * s + 1013904223) % m) / m;
}

/** Map a symmetric value `v` in [-1, 1] (scaled by `half`) to an offset on
 *  the given side of the line. One-sided offsets start a radius off it. */
function onSide(v: number, half: number, r: number, side: OverlapSide) {
  if (side === "middle") return v * half;
  const away = r + (v + 1) * half;
  return side === "start" ? away : -away;
}

/**
 * A Gaussian kernel density estimate of the items' data-axis positions,
 * normalized so the densest item reads 1 (ggbeeswarm's `vipor` does the
 * same). Bandwidth: Silverman's rule of thumb.
 */
function normalizedDensities(items: OverlapItem[]): number[] {
  const n = items.length;
  if (n === 0) return [];
  const xs = items.map((it) => it.at);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  const sorted = [...xs].sort((a, b) => a - b);
  const iqr =
    sorted[Math.floor(0.75 * (n - 1))] - sorted[Math.floor(0.25 * (n - 1))];
  const spread = Math.min(sd, iqr / 1.34) || sd || 1;
  const h = 0.9 * spread * Math.pow(n, -0.2);
  const dens = xs.map((x) => {
    let s = 0;
    for (const y of xs) s += Math.exp(-0.5 * ((x - y) / h) ** 2);
    return s;
  });
  const max = Math.max(...dens);
  return dens.map((d) => d / max);
}

/** The van der Corput sequence in base 2: the i-th term (i ≥ 1). */
function vanDerCorput(i: number): number {
  let q = 0;
  let bk = 0.5;
  for (let k = i; k > 0; k = Math.floor(k / 2), bk /= 2) q += (k % 2) * bk;
  return q;
}

/**
 * (b) ggbeeswarm's `quasirandom`: offset = (2·vdc(rank) − 1) · density · width,
 * where rank orders the points by data value (ties by data order) and density
 * is the normalized KDE at the point. Deterministic; no collision check.
 */
export function quasirandomProto(
  opts: { width?: number } = {}
): ResolverStrategy {
  const width = opts.width ?? 20;
  return {
    kind: "resolver",
    resolve: (items, side) => {
      const dens = normalizedDensities(items);
      const order = items
        .map((it, i) => ({ at: it.at, i }))
        .sort((a, b) => a.at - b.at || a.i - b.i);
      const rank = new Array<number>(items.length);
      order.forEach(({ i }, k) => (rank[i] = k + 1));
      return items.map((it, i) =>
        onSide(2 * vanDerCorput(rank[i]) - 1, width * dens[i], it.r, side)
      );
    },
  };
}

/**
 * (c) Blue noise inside the same KDE envelope: Mitchell's best candidate.
 * For each dot in data order, draw `k` seeded candidates uniformly within
 * ±density·width and keep the one whose closest already-placed neighbor (by
 * gap between enclosing circles, plus `padding`) is farthest away. Neighbors
 * come from the shared grid. No hard guarantee against overlap.
 */
export function blueNoiseProto(
  opts: { width?: number; padding?: number; k?: number; seed?: number } = {}
): ResolverStrategy {
  const width = opts.width ?? 20;
  const padding = opts.padding ?? 0;
  const k = opts.k ?? 10;
  return {
    kind: "resolver",
    resolve: (items, side) => {
      const dens = normalizedDensities(items);
      const rand = lcg(opts.seed ?? 0);
      const grid = NeighborGrid.forItems(items, padding);
      const ys = new Array<number>(items.length);
      items.forEach((it, i) => {
        let best = 0;
        let bestScore = -Infinity;
        for (let c = 0; c < k; c++) {
          const y = onSide(2 * rand() - 1, width * dens[i], it.r, side);
          let score = Infinity;
          for (const j of grid.near(it.at, 2)) {
            const gap =
              Math.hypot(it.at - items[j].at, y - ys[j]) -
              (it.r + items[j].r + padding);
            if (gap < score) score = gap;
          }
          if (score > bestScore) {
            bestScore = score;
            best = y;
          }
        }
        ys[i] = best;
        grid.insert(i);
      });
      return ys;
    },
  };
}

/**
 * (d) Plain random jitter (seaborn `stripplot`, ggplot `position_jitter`):
 * seeded uniform offsets in a fixed band of ±width. No density shaping, no
 * collision check.
 */
export function uniformJitterProto(
  opts: { width?: number; seed?: number } = {}
): ResolverStrategy {
  const width = opts.width ?? 20;
  return {
    kind: "resolver",
    resolve: (items, side) => {
      const rand = lcg(opts.seed ?? 0);
      return items.map((it) => onSide(2 * rand() - 1, width, it.r, side));
    },
  };
}
