// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * The Voronoi tiling of `Tile.voronoi` (#1222): one level of a Voronoi
 * treemap. It cuts a convex region into one convex cell per value, each with
 * an area proportional to its value.
 *
 * The cells are a power diagram: each site has a weight, and a point belongs
 * to the site whose squared distance less its weight is least. Each cell is
 * the region cut by one half-plane per other site (`clipToHalfPlane`), so
 * every cell is convex and can be the region of the next level.
 *
 * The loop follows Nocaj and Brandes 2012 ("Computing Voronoi treemaps:
 * faster, simpler, and resolution-independent"), as d3-voronoi-map does:
 * move each site to its cell's centroid, then fit the weights to the
 * target areas. It fits the weights with a Newton step instead of their
 * ratio rule (#1274):
 *
 *  1. Place one site per value at random in the region, from a seeded
 *     generator (`lcg`), so the same seed gives the same cells. Every
 *     weight starts at 0, so the first diagram is a plain Voronoi diagram.
 *  2. Move each site to the centroid of its cell, which keeps cells round,
 *     and lower any weight that beats a neighbor's by more than their
 *     squared distance, since that site would swallow its neighbor's cell
 *     (as d3-voronoi-map does).
 *  3. Take one Newton step on the weights ({@link newtonStep}). With the
 *     sites fixed, each cell's area is a function of the weights whose
 *     derivatives are known exactly: raising `wᵢ` by `δ` moves the border
 *     with each neighbor `j` out by `δ / 2dᵢⱼ`, so cell `i` gains
 *     `δ · Lᵢⱼ / 2dᵢⱼ` of area from `j`, where `Lᵢⱼ` is the border's length
 *     and `dᵢⱼ` the distance between the sites. The step solves that
 *     linear system for the weight change that gives every cell its target
 *     area (Aurenhammer, Hoffmann and Aronov 1998; the damped Newton method
 *     of Kitagawa, Mérigot and Thibert 2019). It halves the step until no
 *     cell loses more than half its area, so no cell vanishes.
 *  4. Repeat 2 and 3 until every cell's area is within {@link TOLERANCE}
 *     of its target and no site moved more than {@link SETTLED} of a mean
 *     cell's side, or {@link MAX_ITERATIONS} have run. A Newton step meets
 *     the tolerance within a few iterations, so the second test is what
 *     gives the sites time to relax into round cells. When the loop runs
 *     out, it keeps the iteration with the least error.
 */
import type { Point } from "./outline";
import { clipToHalfPlane } from "./clip";
import { ringExtent } from "./box";
import { pointInRing } from "./plane";
import { hasArea, ringArea, ringCentroid, type Ring } from "./ring";
import { lcg } from "../../util/lcg";

/** The loop stops when every cell's area is within this share of its
 *  target area (and the sites have settled). */
export const TOLERANCE = 0.02;

/** The loop stops when no site moved more than this share of a mean
 *  cell's side, `√(area / count)`, in an iteration (and the areas are
 *  within tolerance). */
const SETTLED = 0.02;

/** The loop stops after this many iterations, whatever the error. */
const MAX_ITERATIONS = 300;

/** The half-plane `a·x + b·y ≤ c` of the points nearer, in power distance,
 *  to `si` with weight `wi` than to `sj` with weight `wj`:
 *  `|p − sᵢ|² − wᵢ ≤ |p − sⱼ|² − wⱼ ⇔ 2p · (sⱼ − sᵢ) ≤ |sⱼ|² − |sᵢ|² − wⱼ + wᵢ`. */
function bisector(
  si: Point,
  sj: Point,
  wi: number,
  wj: number
): [number, number, number] {
  return [
    2 * (sj[0] - si[0]),
    2 * (sj[1] - si[1]),
    sj[0] ** 2 + sj[1] ** 2 - si[0] ** 2 - si[1] ** 2 - wj + wi,
  ];
}

/** The power cells of `sites` with `weights`, clipped to the convex
 *  `region`: a point `p` is in site `i`'s cell when
 *  `|p − sᵢ|² − wᵢ ≤ |p − sⱼ|² − wⱼ` for every other site `j`. A `gap`
 *  moves each border between two cells back by half of it on each side,
 *  so neighbors are `gap` apart; the region's own edges do not move. */
export function powerCells(
  region: Ring,
  sites: readonly Point[],
  weights: readonly number[],
  gap = 0
): Ring[] {
  return sites.map((si, i) => {
    let cell = region;
    for (let j = 0; j < sites.length && cell.length > 0; j++) {
      if (j === i) continue;
      const [a, b, c] = bisector(si, sites[j], weights[i], weights[j]);
      cell = clipToHalfPlane(cell, a, b, c - (gap / 2) * Math.hypot(a, b));
    }
    return cell;
  });
}

/** One site per target, at random in `region`, from `rand`. A thin region
 *  that rejects every try puts the site near its centroid instead. */
function placeSites(region: Ring, count: number, rand: () => number): Point[] {
  const { minX, maxX, minY, maxY } = ringExtent(region);
  const [cx, cy] = ringCentroid(region);
  const sites: Point[] = [];
  for (let i = 0; i < count; i++) {
    let site: Point | undefined;
    for (let tries = 0; tries < 200 && site === undefined; tries++) {
      const p: Point = [
        minX + rand() * (maxX - minX),
        minY + rand() * (maxY - minY),
      ];
      if (pointInRing(p, region)) site = p;
    }
    // Apart from each other, so no two sites meet.
    sites.push(
      site ?? [
        cx + (i + 1) * 1e-3 * (maxX - minX),
        cy + (i + 1) * 1e-3 * (maxY - minY),
      ]
    );
  }
  return sites;
}

/** Lower each weight that beats another's by more than the squared distance
 *  between their sites: that site's cell would hold the other site, and the
 *  other cell could empty (as d3-voronoi-map does). */
function capWeights(sites: readonly Point[], weights: number[]): void {
  const n = sites.length;
  for (let pass = 0; pass < 10; pass++) {
    let lowered = false;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j || weights[i] < weights[j]) continue;
        const d2 =
          (sites[i][0] - sites[j][0]) ** 2 + (sites[i][1] - sites[j][1]) ** 2;
        const over = weights[i] - weights[j] - d2;
        if (over > 0) {
          weights[i] -= over + 1e-6;
          lowered = true;
        }
      }
    if (!lowered) return;
  }
}

/** For each cell, its neighbors `j` with `Lᵢⱼ / 2dᵢⱼ`: the area it gains
 *  from `j` per unit its weight rises. A border with `j` is an edge of the
 *  cell on the line of {@link bisector}; `scale` sets how near a point must
 *  be to that line to be on it. */
function couplings(
  sites: readonly Point[],
  weights: readonly number[],
  cells: readonly Ring[],
  scale: number
): [number, number][][] {
  const near = 1e-7 * scale;
  return cells.map((cell, i) => {
    const out: [number, number][] = [];
    for (let j = 0; j < sites.length && cell.length >= 3; j++) {
      if (j === i) continue;
      const [a, b, c] = bisector(sites[i], sites[j], weights[i], weights[j]);
      const norm = Math.hypot(a, b); // 2dᵢⱼ
      const tol = near * norm;
      let length = 0;
      for (let k = 0; k < cell.length; k++) {
        const p = cell[k];
        const q = cell[(k + 1) % cell.length];
        if (
          Math.abs(a * p[0] + b * p[1] - c) <= tol &&
          Math.abs(a * q[0] + b * q[1] - c) <= tol
        )
          length += Math.hypot(q[0] - p[0], q[1] - p[1]);
      }
      if (length > 0) out.push([j, length / norm]);
    }
    return out;
  });
}

const dot = (u: readonly number[], v: readonly number[]): number => {
  let s = 0;
  for (let i = 0; i < u.length; i++) s += u[i] * v[i];
  return s;
};

/** The Laplacian of the weighted neighbor graph `links` times `v`. */
function laplacian(
  links: [number, number][][],
  v: readonly number[]
): number[] {
  return links.map((list, i) => {
    let s = 0;
    for (const [j, h] of list) s += h * (v[i] - v[j]);
    return s;
  });
}

/** The weight change `δ` with `Σⱼ hᵢⱼ (δᵢ − δⱼ) = gainᵢ` for every cell,
 *  by conjugate gradients. The matrix is the Laplacian of the cells'
 *  neighbor graph, weighted by {@link couplings}: symmetric, and singular
 *  only along adding one constant to every weight, which moves no border.
 *  The gains sum to 0 (the cells tile the region), so a solution exists. */
function newtonStep(links: [number, number][][], gain: number[]): number[] {
  const n = gain.length;
  const mean = gain.reduce((s, g) => s + g, 0) / n;
  const x = new Array<number>(n).fill(0);
  const r = gain.map((g) => g - mean);
  const p = r.slice();
  let rr = dot(r, r);
  const stop = 1e-20 * rr;
  for (let k = 0; k < n && rr > stop; k++) {
    const ap = laplacian(links, p);
    const alpha = rr / dot(p, ap);
    if (!Number.isFinite(alpha)) break;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * ap[i];
    }
    const next = dot(r, r);
    for (let i = 0; i < n; i++) p[i] = r[i] + (next / rr) * p[i];
    rr = next;
  }
  return x;
}

/** The power diagram of `targets` in the convex `region`, fitted by the
 *  loop above: its sites, weights and cells, the cells' worst relative area
 *  error, and how many iterations it took. */
export function fitPowerCells(
  region: Ring,
  targets: readonly number[],
  seed: number
): {
  sites: Point[];
  weights: number[];
  cells: Ring[];
  error: number;
  iterations: number;
} {
  const n = targets.length;
  const { minX, maxX, minY, maxY } = ringExtent(region);
  const scale = Math.max(maxX - minX, maxY - minY);
  const side = Math.sqrt(ringArea(region) / n);
  const sites = placeSites(region, n, lcg(seed));
  let weights = targets.map(() => 0);
  let cells = powerCells(region, sites, weights);
  const errorOf = (cs: readonly Ring[]) =>
    Math.max(
      ...cs.map((c, k) => Math.abs(ringArea(c) - targets[k]) / targets[k])
    );
  let best = {
    sites: sites.slice(),
    weights: weights.slice(),
    cells,
    error: errorOf(cells),
  };
  for (let it = 1; it <= MAX_ITERATIONS; it++) {
    // 2. Each site to the centroid of its cell.
    let moved = 0;
    cells.forEach((c, k) => {
      if (c.length < 3) return;
      const g = ringCentroid(c);
      moved = Math.max(
        moved,
        Math.hypot(g[0] - sites[k][0], g[1] - sites[k][1])
      );
      sites[k] = g;
    });
    capWeights(sites, weights);
    cells = powerCells(region, sites, weights);
    // 3. One damped Newton step on the weights.
    const areas = cells.map(ringArea);
    const step = newtonStep(
      couplings(sites, weights, cells, scale),
      targets.map((t, k) => t - areas[k])
    );
    // Halve the step until every cell keeps half its area; after 30
    // halvings, take that tiny step.
    for (let tau = 1, tries = 0; tries < 30; tau /= 2, tries++) {
      const tried = weights.map((w, k) => w + tau * step[k]);
      const triedCells = powerCells(region, sites, tried);
      const kept = triedCells.every(
        (c, k) => ringArea(c) >= 0.5 * Math.min(targets[k], areas[k])
      );
      if (kept || tries === 29) {
        weights = tried;
        cells = triedCells;
        break;
      }
    }
    const error = errorOf(cells);
    if (error < TOLERANCE && moved < SETTLED * side)
      return { sites, weights, cells, error, iterations: it };
    if (error < best.error)
      best = { sites: sites.slice(), weights: weights.slice(), cells, error };
  }
  return { ...best, iterations: MAX_ITERATIONS };
}

/**
 * The cells of `values` in the convex `region`: one convex ring per value,
 * in the order of `values`, each with an area close to the value's share of
 * the region's area (within {@link TOLERANCE} of it, when the loop
 * converges). A value that is not positive gets an empty ring, and so does
 * every value in a region with no area. The same `seed` gives the same
 * cells.
 */
export function voronoiTiling(
  region: Ring,
  values: readonly number[],
  seed: number,
  gap = 0
): Ring[] {
  const cells: Ring[] = values.map(() => []);
  const live = values.flatMap((v, i) =>
    Number.isFinite(v) && v > 0 ? [i] : []
  );
  if (!hasArea(region) || live.length === 0) return cells;
  if (live.length === 1) {
    cells[live[0]] = region.slice();
    return cells;
  }
  const area = ringArea(region);
  const total = live.reduce((s, i) => s + values[i], 0);
  const fit = fitPowerCells(
    region,
    live.map((i) => (values[i] / total) * area),
    seed
  );
  // The gap comes off the borders between cells only, after the areas
  // are fitted, as d3's paddingInner does for the rectangular tilings.
  const fitted =
    gap === 0 ? fit.cells : powerCells(region, fit.sites, fit.weights, gap);
  live.forEach((i, k) => (cells[i] = fitted[k]));
  return cells;
}
