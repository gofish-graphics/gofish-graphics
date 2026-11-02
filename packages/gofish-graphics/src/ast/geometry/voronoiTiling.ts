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
 * faster, simpler, and resolution-independent"), simplified:
 *
 *  1. Place one site per value at random in the region, from a seeded
 *     generator (`lcg`), so the same seed gives the same cells.
 *  2. Give every site a small weight and compute the power diagram.
 *  3. Move each site to the centroid of its cell, which keeps cells round.
 *  4. Grow each weight's square root (its radius) by the radius of the
 *     cell's target area less the radius of its area, then lower any weight
 *     that beats a neighbor's by more than their squared distance, since
 *     that site would swallow its neighbor's.
 *  5. Repeat 3 and 4 until every cell's area is within {@link TOLERANCE} of
 *     its target, or {@link MAX_ITERATIONS} have run, and keep the
 *     iteration with the least error.
 */
import type { Point } from "./outline";
import { clipToHalfPlane } from "./clip";
import { ringExtent } from "./box";
import { pointInRing } from "./plane";
import { ringArea, ringCentroid, type Ring } from "./ring";
import { lcg } from "../../util/lcg";

type Pt = [number, number];

/** The loop stops when every cell's area is within this share of its
 *  target area. */
export const TOLERANCE = 0.02;

/** The loop stops after this many iterations, whatever the error. */
export const MAX_ITERATIONS = 300;

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
): Pt[][] {
  return sites.map((si, i) => {
    let cell: Pt[] = region.map(([x, y]) => [x, y]);
    for (let j = 0; j < sites.length && cell.length > 0; j++) {
      if (j === i) continue;
      const sj = sites[j];
      // |p − sᵢ|² − wᵢ ≤ |p − sⱼ|² − wⱼ
      //   ⇔ 2p · (sⱼ − sᵢ) ≤ |sⱼ|² − |sᵢ|² − wⱼ + wᵢ
      const a = 2 * (sj[0] - si[0]);
      const b = 2 * (sj[1] - si[1]);
      cell = clipToHalfPlane(
        cell,
        a,
        b,
        sj[0] ** 2 +
          sj[1] ** 2 -
          si[0] ** 2 -
          si[1] ** 2 -
          weights[j] +
          weights[i] -
          (gap / 2) * Math.hypot(a, b)
      );
    }
    return cell;
  });
}

/** One site per target, at random in `region`, from `rand`. A thin region
 *  that rejects every try puts the site near its centroid instead. */
function placeSites(region: Ring, count: number, rand: () => number): Pt[] {
  const { minX, maxX, minY, maxY } = ringExtent(region);
  const [cx, cy] = ringCentroid(region);
  const sites: Pt[] = [];
  for (let i = 0; i < count; i++) {
    let site: Pt | undefined;
    for (let tries = 0; tries < 200 && site === undefined; tries++) {
      const p: Pt = [
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
function capWeights(sites: readonly Pt[], weights: number[]): void {
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

/**
 * The cells of `values` in the convex `region`: one convex ring per value,
 * in the order of `values`, each with an area close to the value's share of
 * the region's area (within {@link TOLERANCE} of it, when the loop
 * converges). A value that is not positive gets an empty ring. The same
 * `seed` gives the same cells.
 */
export function voronoiTiling(
  region: Ring,
  values: readonly number[],
  seed: number,
  gap = 0
): Pt[][] {
  const cells: Pt[][] = values.map(() => []);
  const live = values.flatMap((v, i) =>
    Number.isFinite(v) && v > 0 ? [i] : []
  );
  if (region.length < 3 || live.length === 0) return cells;
  if (live.length === 1) {
    cells[live[0]] = region.map(([x, y]) => [x, y]);
    return cells;
  }
  const area = ringArea(region);
  const total = live.reduce((s, i) => s + values[i], 0);
  const targets = live.map((i) => (values[i] / total) * area);
  const sites = placeSites(region, live.length, lcg(seed));
  const weights = targets.map((t) => (t / Math.PI) * 0.1);
  let best: { sites: Pt[]; weights: number[]; error: number } | undefined;
  let current = powerCells(region, sites, weights);
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    // Each site to the centroid of its cell.
    current.forEach((c, k) => {
      if (c.length >= 3) sites[k] = ringCentroid(c) as Pt;
    });
    current = powerCells(region, sites, weights);
    // Each weight toward its target area, by the radius of the area it
    // lacks (or has too much of).
    current.forEach((c, k) => {
      const r =
        Math.sqrt(Math.max(weights[k], 0)) +
        Math.sqrt(targets[k] / Math.PI) -
        Math.sqrt(ringArea(c) / Math.PI);
      weights[k] = Math.max(r, 1e-3) ** 2;
    });
    capWeights(sites, weights);
    current = powerCells(region, sites, weights);
    const error = Math.max(
      ...current.map((c, k) => Math.abs(ringArea(c) - targets[k]) / targets[k])
    );
    if (best === undefined || error < best.error)
      best = { sites: sites.slice(), weights: weights.slice(), error };
    if (error < TOLERANCE) break;
  }
  // The gap comes off the borders between cells only, after the areas
  // are fitted, as d3's paddingInner does for the rectangular tilings.
  const fitted = powerCells(region, best!.sites, best!.weights, gap);
  live.forEach((i, k) => (cells[i] = fitted[k]));
  return cells;
}
