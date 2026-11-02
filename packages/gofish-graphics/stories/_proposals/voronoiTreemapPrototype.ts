// PROTOTYPE (#1222): throwaway layout math for the Voronoi treemap proposal.
// Not library code. It computes polygons in pixels; the stories draw them with
// real GoFish `polygon()` marks. A real implementation would live in the
// treemap operator as a `Tile.voronoi()` strategy over a polygon region.
import {
  hierarchy,
  packSiblings,
  packEnclose,
  treemap as d3Treemap,
  treemapSquarify,
} from "d3-hierarchy";
import { insetConvex } from "../../src/ast/geometry";

export type Pt = [number, number];
export type Ring = Pt[];

// --- small polygon helpers ---------------------------------------------------

export const area = (r: Ring): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
};

export const centroid = (r: Ring): Pt => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-12) return r[0];
  return [cx / (3 * a), cy / (3 * a)];
};

/** Keep the part of convex `poly` where a·p ≤ b (one Sutherland–Hodgman step). */
function clipHalfPlane(poly: Ring, ax: number, ay: number, b: number): Ring {
  const out: Ring = [];
  const f = (p: Pt) => ax * p[0] + ay * p[1] - b;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const fc = f(cur);
    const fp = f(prev);
    if (fc <= 0) {
      if (fp > 0) {
        const t = fp / (fp - fc);
        out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
      }
      out.push(cur);
    } else if (fp <= 0) {
      const t = fp / (fp - fc);
      out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
    }
  }
  return out;
}

export const pointInConvex = (p: Pt, r: Ring): boolean => {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    const c = (x1 - x0) * (p[1] - y0) - (y1 - y0) * (p[0] - x0);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
};

export const circleRing = (cx: number, cy: number, r: number, n = 96): Ring =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as Pt;
  });

export const rectRing = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

// Deterministic PRNG (mulberry32), so the prototype renders the same each time.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- one level: a weighted Voronoi (power) diagram in a convex region --------

/** The power cells of `sites` with `weights`, clipped to the convex `region`. */
export function powerCells(region: Ring, sites: Pt[], weights: number[]): Ring[] {
  return sites.map((si, i) => {
    let cell = region;
    for (let j = 0; j < sites.length && cell.length > 0; j++) {
      if (j === i) continue;
      const sj = sites[j];
      // |p-si|² - wi ≤ |p-sj|² - wj  ⇔  2p·(sj-si) ≤ |sj|²-|si|² - wj + wi
      cell = clipHalfPlane(
        cell,
        2 * (sj[0] - si[0]),
        2 * (sj[1] - si[1]),
        sj[0] ** 2 + sj[1] ** 2 - si[0] ** 2 - si[1] ** 2 - weights[j] + weights[i]
      );
    }
    return cell;
  });
}

/**
 * One level of a Voronoi treemap (after Nocaj & Brandes 2012, simplified):
 * cells in the convex `region` whose areas are proportional to `values`.
 * Lloyd steps move each site to its cell's centroid; each weight is scaled by
 * target/area and capped below the squared distance to the nearest site, so no
 * cell empties.
 */
export function voronoiLevel(
  region: Ring,
  values: number[],
  { seed = 1, iterations = 400 }: { seed?: number; iterations?: number } = {}
): { cells: Ring[]; error: number } {
  const n = values.length;
  if (n === 1) return { cells: [region], error: 0 };
  const total = values.reduce((a, b) => a + b, 0);
  const A = area(region);
  const target = values.map((v) => (v / total) * A);
  // Seed sites uniformly inside the region.
  const rand = rng(seed);
  const xs = region.map((p) => p[0]);
  const ys = region.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sites: Pt[] = [];
  while (sites.length < n) {
    const p: Pt = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
    if (pointInConvex(p, region)) sites.push(p);
  }
  let weights = target.map((t) => (t / Math.PI) * 0.1);
  let cells = powerCells(region, sites, weights);
  let error = 1;
  for (let it = 0; it < iterations; it++) {
    // Lloyd: move each site to the centroid of its cell.
    cells.forEach((c, i) => {
      if (c.length >= 3) sites[i] = centroid(c);
    });
    cells = powerCells(region, sites, weights);
    // Weight update toward the target area.
    weights = weights.map((w, i) => {
      const a = Math.max(area(cells[i]), 1e-6);
      return Math.max(w * (target[i] / a), 1e-3);
    });
    // Cap: a site whose weight beats a neighbor's by more than their squared
    // distance swallows that neighbor's site, and can empty its cell. Lower
    // the heavier weight until no pair does (as d3-voronoi-map does).
    for (let pass = 0; pass < 10; pass++) {
      let fixed = 0;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          if (i === j || weights[i] < weights[j]) continue;
          const d2 = (sites[i][0] - sites[j][0]) ** 2 + (sites[i][1] - sites[j][1]) ** 2;
          const over = weights[i] - weights[j] - d2;
          if (over > 0) {
            weights[i] -= over + 1e-6;
            fixed++;
          }
        }
      if (!fixed) break;
    }
    cells = powerCells(region, sites, weights);
    // The worst cell's area error, relative to its target.
    error = Math.max(...cells.map((c, i) => Math.abs(area(c) - target[i]) / target[i]));
    if (error < 0.02) break;
  }
  return { cells, error };
}

// --- one level: squarify in a rectangular region (via d3) --------------------

function squarifyLevel(region: Ring, values: number[]): Ring[] {
  const xs = region.map((p) => p[0]);
  const ys = region.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const root = hierarchy<any>({ children: values.map((v, i) => ({ v, i })) })
    .sum((d) => d.v ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  d3Treemap<any>().tile(treemapSquarify).size([x1 - x0, y1 - y0])(root);
  const out: Ring[] = new Array(values.length);
  for (const l of root.leaves() as any[])
    out[l.data.i] = rectRing(x0 + l.x0, y0 + l.y0, x0 + l.x1, y0 + l.y1);
  return out;
}

// --- recursion: one level per key ---------------------------------------------

export type Level = {
  /** The field this level groups by; omitted on the last level (one per row). */
  by?: string;
  tile: "voronoi" | "squarify";
  /** Pixels drawn in from each side of a cell before the next level. */
  padding?: number;
};

export type Cell<T> = {
  ring: Ring;
  depth: number;
  /** The key at this depth (the group's value, or the row's index). */
  key: string;
  rows: T[];
  /** The first row's fields, so marks can read `continent` etc. */
  [field: string]: any;
};

/**
 * Lay `rows` out as a treemap whose levels are given one by one, each with
 * its own tile. Returns every cell at every depth (depth 0 = first level).
 */
export function nestedTreemap<T extends Record<string, any>>(
  rows: T[],
  region: Ring,
  levels: Level[],
  size: (row: T) => number,
  depth = 0,
  seed = 7
): Cell<T>[] {
  if (depth >= levels.length) return [];
  const level = levels[depth];
  const groups: [string, T[]][] = level.by
    ? Array.from(
        rows.reduce((m, r) => {
          const k = String(r[level.by!]);
          m.set(k, [...(m.get(k) ?? []), r]);
          return m;
        }, new Map<string, T[]>())
      )
    : rows.map((r, i) => [String(i), [r]]);
  const values = groups.map(([, g]) => g.reduce((s, r) => s + size(r), 0));
  const cells =
    level.tile === "voronoi"
      ? voronoiLevel(region, values, { seed: seed + depth * 31 }).cells
      : squarifyLevel(region, values);
  const out: Cell<T>[] = [];
  groups.forEach(([key, g], i) => {
    out.push({ ...g[0], ring: cells[i], depth, key, rows: g });
    const inner = insetConvex(cells[i], level.padding ?? 0) ?? cells[i];
    if (inner.length >= 3)
      out.push(...nestedTreemap(g, inner as Ring, levels, size, depth + 1, seed + i * 13));
  });
  return out;
}

// --- a circle pack fitted into a convex cell ----------------------------------

/** The center and radius of a large circle inside the convex `ring`: the
 *  centroid, with the distance to the nearest edge. (Not the true largest
 *  inscribed circle; good enough for the prototype.) */
export function inscribedCircle(ring: Ring): { cx: number; cy: number; r: number } {
  // Search a grid for the point farthest from every edge.
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const edgeDist = (p: Pt) => {
    let m = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      m = Math.min(m, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len);
    }
    return m;
  };
  let best = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: 0 };
  const N = 40;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const p: Pt = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!pointInConvex(p, ring)) continue;
      const d = edgeDist(p);
      if (d > best.r) best = { cx: p[0], cy: p[1], r: d };
    }
  return best;
}

/** Pack circles of radius √value (times one shared scale `k`) and center the
 *  pack at (cx, cy). Returns the circles and the pack's own radius at k = 1. */
export function packAt(values: number[], k: number, spacing: number) {
  const circles = packSiblings(values.map((v) => ({ r: Math.sqrt(v) * k + spacing / 2 }))) as any[];
  const e = packEnclose(circles as any) ?? { x: 0, y: 0, r: 0 };
  return { circles: circles.map((c) => ({ x: c.x - e.x, y: c.y - e.y, r: c.r - spacing / 2 })), R: e.r };
}
