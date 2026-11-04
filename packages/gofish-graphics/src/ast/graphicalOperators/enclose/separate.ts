/**
 * PROTOTYPE (scratch, not for merge): where one piece of a `Shape.blob` may
 * be drawn: kept apart from the set's other pieces (`join` below ∞) and out
 * of the keep-outs (`avoiding`, grown by `clearance`). One field per piece,
 * on a grid over the box its fill stays in; the piece's smoothed outline is
 * cut by it once, after the smoothing (unified.ts, finish), so neither the
 * smoothing nor its outward offset ever moves an outline back across it.
 *
 * Allowed for piece i: its own filled spine (always: the members win over
 * every other rule), or a point that is
 *
 *   - nearer piece i than the others by at least s, smoothly: G(x) ≤ −s,
 *     G the Gaussian blur (SEPARATE.sigma px) of g = d_i − d_¬i (d_i the
 *     distance to piece i's spine, 0 inside it; d_¬i to the nearest other
 *     piece's). The blur takes the bumps out of the bisector between two
 *     rows of discs, so a clipped side is a clean curve at every convexity
 *     (convexity 2 has no outline blur of its own to hide them);
 *   - at least s from every other piece (d_¬i ≥ s);
 *   - outside the keep-out region: the keep-out discs' union closed by a
 *     disc of SEPARATE.open px (keepRegion), so the ground between the
 *     keep-outs is opened by it: no sliver of it narrower than about
 *     2 · open px, and its corners between keep-outs are round.
 *
 * Two pieces' regions stay s apart (or as near as their spines already
 * are): d_i − d_j is 2-Lipschitz, so is its blur, and g_i ≥ d_i − d_j, so
 * a point with G_i ≤ −s and one with G_j ≤ −s are s apart; a point of
 * piece j's region is s from piece i's spine by the second rule. Neither
 * rule depends on convexity, so a clipped fill still grows with it.
 *
 * As one field, negative where allowed:
 *
 *   Ψ = max(smin(sd_i, max(G + s, s − d_¬i)), min(sd_i, k)),
 *
 * smin a smooth min of width SEPARATE.fillet (a fillet where the spine
 * sticks out past the rest, at most fillet/4 px past either; there the gap
 * kept may close by as much),
 * sd_i the signed distance to piece i's spine, k the signed distance to the
 * keep-out region (positive inside). The keep-outs take a plain min with the
 * spine, no smooth one: the cut never enters a keep-out but where the padded
 * members do, and there it leaves a sharp concave corner (rounding it would
 * enter one or the other). Ψ is 2-Lipschitz.
 *
 * The cut outline is the zero level of max(sd_R, Ψ), sd_R the signed
 * distance to the outline, traced by marching squares on a grid of step h
 * (1 px) (cutRings): one field, so the cut has no crossings and grows with
 * the outline. Fields are evaluated exactly only near that level: blocks of
 * the grid are refined by halves (a quadtree) where it can cross; Ψ once
 * per node and kept with the piece (a convexity change reuses it); g only
 * where its blur can come near −s (within CL of it; elsewhere a clamped
 * value of the right sign, which the blur, truncated at 3σ, never carries
 * to the level).
 */
import type { Pt } from "./blob";
import { SegGrid, Inside, segsOf } from "./meshBlend";
import { closingRings, withArcsTolerance } from "./arcs";
import { signedArea2, pointInRing } from "../../geometry/plane";

type Box = [number, number, number, number];

const boxOf = (rings: Pt[][]): Box => {
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < xa) xa = x;
      if (x > xb) xb = x;
      if (y < ya) ya = y;
      if (y > yb) yb = y;
    }
  return [xa, ya, xb, yb];
};

/** PROTOTYPE: the field's knobs. sigma: the blur of g, px (the bisector's
 *  smoothing); h: the grid step, px; round: the width, px, of the rounding
 *  of the convex corners the cut leaves (arcsSmooth.ts, roundCut); fillet:
 *  the width k, px, of the smooth union of the spine with the rest between
 *  pieces, which fills the concave corners where a spine sticks out past a
 *  clipped side (they cannot be rounded inward), reaching at most k/4 past
 *  either; open: the radius, px, of the disc the keep-out region is closed
 *  by (keepRegion). */
export const SEPARATE = { sigma: 4, h: 1, round: 3, fillet: 6, open: 3 };

export const SEPARATE_STATS: { ms?: number; evals?: number; nodes?: number } =
  {};

/** A keep-out: a disc the outline stays out of (an avoided member grown by
 *  the clearance). */
export type KeepDisc = { c: Pt; R: number };

/**
 * The ground the keep-outs forbid: their union closed (arcs.ts, the exact closing) by a disc
 * of radius `rho`, holes kept. The allowed ground less the keep-outs is opened by the same
 * disc (the opening of a set is the complement of the closing of its complement): a sliver of
 * ground narrower than about 2 rho between two keep-outs is forbidden too, and the corners
 * between two keep-outs are rounded. The closing holds the union, so the cut never enters a
 * keep-out; the padded members alone are allowed inside it (cutField).
 */
export function keepRegion(K: KeepDisc[], rho: number): Pt[][] {
  if (!K.length) return [];
  // sampled to 0.02 px, not the arcs' 0.2: a chord cuts inside its arc, and the cut keeps
  // off the rings, so their chord error is clearance lost
  return withArcsTolerance(0.02, () =>
    closingRings(
      K.map((k) => ({ kind: "disc" as const, cx: k.c[0], cy: k.c[1], r: k.R })),
      0,
      Math.max(0, rho),
      true
    )
  );
}

/** A spine's box (for nearPieces). */
export const spineBox = (rings: Pt[][]): Box => boxOf(rings);

/** The other pieces that can be nearer than piece i somewhere in the box it
 *  fills: a point of the box is at most `reach` from piece i's spine. `sb`:
 *  every piece's spine box. */
export function nearPieces(
  i: number,
  sb: Box[],
  box: Box,
  s: number
): number[] {
  const [bx0, by0, bx1, by1] = box;
  const reach = Math.hypot(bx1 - bx0, by1 - by0) + s;
  const near: number[] = [];
  for (let j = 0; j < sb.length; j++) {
    if (j === i) continue;
    const B = sb[j];
    if (
      B[0] <= bx1 + reach &&
      B[2] >= bx0 - reach &&
      B[1] <= by1 + reach &&
      B[3] >= by0 - reach
    )
      near.push(j);
  }
  return near;
}

/** One piece's allowed ground (see the top of the file) on its grid, with
 *  what the cut evaluates lazily and keeps between calls: Ψ at each node
 *  once asked (it does not depend on the outline being cut, so a convexity
 *  drag reuses it). */
export type CutField = {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  W: number;
  h: number;
  /** Ψ at the nodes asked so far (NaN: not yet) */
  PSI: Float64Array;
  psi: (q: number) => number;
  stats: { ms: number; evals: number };
};

/** Values past this are only kept as signs (the quadtree's blocks are at
 *  most B = 8 steps, so a sign is sure past √2·8·h). */
const B = 8;
const SURE = Math.SQRT2 * B + 4;

/** Refine blocks of B steps by halves where `at` can change sign (it is
 *  2-Lipschitz; a block whose corners all have one sign and |value| >
 *  margin + √2 · its side keeps that sign, and |value| > margin), then fill
 *  the sure blocks (after: their nodes may be shared with blocks that need
 *  them exactly). */
function quad(
  at: (q: number) => number,
  A: Float64Array,
  W: number,
  nx: number,
  ny: number,
  h: number,
  margin: number,
  value: (sign: number) => number
) {
  const later: number[] = [];
  const refine = (i0: number, j0: number, n: number) => {
    const q = j0 * W + i0;
    const a = at(q),
      b = at(q + n),
      c = at(q + n * W),
      d = at(q + n * W + n);
    if (
      Math.min(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) >
        margin + Math.SQRT2 * n * h &&
      Math.sign(a) === Math.sign(b) &&
      Math.sign(b) === Math.sign(c) &&
      Math.sign(c) === Math.sign(d)
    ) {
      later.push(q, n, Math.sign(a));
      return;
    }
    if (n === 1) return;
    const k = n >> 1;
    refine(i0, j0, k);
    refine(i0 + k, j0, k);
    refine(i0, j0 + k, k);
    refine(i0 + k, j0 + k, k);
  };
  for (let j = 0; j < ny; j += B)
    for (let i = 0; i < nx; i += B) refine(i, j, B);
  for (let k = 0; k < later.length; k += 3) {
    const [q0, n, sg] = [later[k], later[k + 1], later[k + 2]];
    const v = value(sg);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const q = q0 + j * W + i;
        if (Number.isNaN(A[q])) A[q] = v;
      }
  }
}

/**
 * One piece's allowed ground (see the top of the file), on a grid over the
 * box its fill stays in. `spine`: its filled spine rings (outer rings
 * winding positive); `near`: the spines of the pieces nearPieces finds, in
 * piece order; `s`: the gap kept between pieces; `keep`: the keep-out
 * region's rings (keepRegion). A function of these alone, so it is cached per piece, its
 * neighbours and the keep-outs. null when nothing is near and no keep-out
 * reaches the box: nothing to cut.
 */
export function cutField(
  spine: Pt[][],
  box: Box,
  near: Pt[][][],
  s: number,
  keep: Pt[][]
): CutField | null {
  const t0 = performance.now();
  const h = SEPARATE.h;
  const [bx0, by0, bx1, by1] = box;
  // the keep-out region's rings that reach the grid (the box and its margin, below)
  const reach = (8 + 2 * Math.ceil(3 * (SEPARATE.sigma / h)) + 1) * h;
  const K = keep.filter((r) => {
    const [xa, ya, xb, yb] = boxOf([r]);
    return (
      xb >= bx0 - reach &&
      xa <= bx1 + reach &&
      yb >= by0 - reach &&
      ya <= by1 + reach
    );
  });
  if (!near.length && !K.length) return null;
  const stats = { ms: 0, evals: 0 };
  const S0 = segsOf(spine);
  const meG = new SegGrid(S0, 4),
    meIn = new Inside(S0);
  const S1 = near.length ? segsOf(near.flat()) : new Float64Array(0);
  const og = near.length ? new SegGrid(S1, 4) : null,
    oin = near.length ? new Inside(S1) : null;
  const SK = K.length ? segsOf(K) : null;
  const kg = SK ? new SegGrid(SK, 4) : null,
    kin = SK ? new Inside(SK) : null;
  // the grid: step h over the box grown by the blur's reach twice and 8
  // steps (the smoothed outline's offset stays well inside that)
  const sig = near.length ? SEPARATE.sigma / h : 0;
  const J = Math.ceil(3 * sig);
  const m = 8 + 2 * J;
  const x0 = bx0 - m * h,
    y0 = by0 - m * h;
  const nx = B * Math.ceil((Math.ceil((bx1 - bx0) / h) + 2 * m) / B),
    ny = B * Math.ceil((Math.ceil((by1 - by0) / h) + 2 * m) / B);
  const W = nx + 1,
    N = W * (ny + 1);
  const X = (q: number) => x0 + (q % W) * h,
    Y = (q: number) => y0 + Math.floor(q / W) * h;
  // d_i (unsigned), where computed, for reuse
  const DI = new Float64Array(N).fill(NaN);
  const di = (q: number) => {
    if (Number.isNaN(DI[q])) {
      const x = X(q),
        y = Y(q);
      DI[q] = meIn.has(x, y) ? 0 : meG.nearest(x, y)[0];
    }
    return DI[q];
  };
  // g + s, with g = d_i − d_¬i, exact where its blur can reach the level;
  // clamped to ±CL elsewhere (the blur reaches 3σ, over which g moves by
  // 6σ), then blurred
  let Gb: Float64Array | null = null;
  if (og && oin) {
    const CL = 6 * sig * h + 4;
    const g = new Float64Array(N).fill(NaN);
    const gAt = (q: number) => {
      if (Number.isNaN(g[q])) {
        stats.evals++;
        const a = di(q);
        const x = X(q),
          y = Y(q);
        const dj = oin.has(x, y) ? 0 : capped(og, x, y, a + s + CL + SURE);
        g[q] = a - dj + s;
      }
      return g[q];
    };
    quad(gAt, g, W, nx, ny, h, CL, (sg) => sg * CL);
    for (let q = 0; q < N; q++) g[q] = Math.max(-CL, Math.min(CL, g[q]));
    const w: number[] = [];
    let z = 0;
    for (let k = -J; k <= J; k++) {
      const v = Math.exp(-(k * k) / (2 * sig * sig));
      w.push(v);
      z += v;
    }
    for (let k = 0; k < w.length; k++) w[k] /= z;
    const tmp = new Float64Array(N);
    for (let j = 0; j <= ny; j++) {
      const r = j * W;
      for (let i = 0; i <= nx; i++) {
        let acc = 0;
        for (let k = -J; k <= J; k++) {
          const ii = i + k < 0 ? 0 : i + k > nx ? nx : i + k;
          acc += w[k + J] * g[r + ii];
        }
        tmp[r + i] = acc;
      }
    }
    Gb = new Float64Array(N);
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        let acc = 0;
        for (let k = -J; k <= J; k++) {
          const jj = j + k < 0 ? 0 : j + k > ny ? ny : j + k;
          acc += w[k + J] * tmp[jj * W + i];
        }
        Gb[j * W + i] = acc;
      }
  }
  // Ψ = smin(sd_i, max(G + s, s − d_¬i, k)), capped to ±SURE
  const PSI = new Float64Array(N).fill(NaN);
  const psi = (q: number) => {
    if (!Number.isNaN(PSI[q])) return PSI[q];
    stats.evals++;
    const x = X(q),
      y = Y(q);
    let sd: number;
    if (meIn.has(x, y)) sd = -capped(meG, x, y, SURE);
    else
      sd = Math.min(
        SURE,
        Number.isNaN(DI[q]) ? capped(meG, x, y, SURE) : DI[q]
      );
    let v = sd;
    if (sd > -SURE) {
      v = -SURE;
      if (og && oin) {
        let rest = -SURE;
        if (Gb) rest = Math.max(rest, Gb[q]);
        const dj = oin.has(x, y) ? 0 : capped(og, x, y, s + SURE);
        rest = Math.max(rest, s - dj);
        // the quadratic smooth min (Quílez): min(a, b) − k/4 · u², u =
        // max(0, 1 − |a − b|/k); 2-Lipschitz as both are
        const k = SEPARATE.fillet;
        const u = k > 0 ? Math.max(0, 1 - Math.abs(sd - rest) / k) : 0;
        v = Math.min(sd, rest) - (k / 4) * u * u;
      }
      // the keep-outs: a plain min with the padded members, no smooth union, so inside
      // the keep-out region only the padded members are allowed
      if (kg && kin) {
        const d = capped(kg, x, y, SURE);
        v = Math.max(v, Math.min(sd, kin.has(x, y) ? d : -d));
      }
    }
    return (PSI[q] = Math.max(-SURE, Math.min(SURE, v)));
  };
  stats.ms = performance.now() - t0;
  return { x0, y0, nx, ny, W, h, PSI, psi, stats };
}

/** The distance from (x, y) to the grid's nearest segment, or `cap` when
 *  that is at least cap (the search stops there). */
function capped(G: SegGrid, x: number, y: number, cap: number): number {
  const { x0, y0, cell, nx, ny, start, items, S } = G;
  const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))),
    cj = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
  const off = Math.max(
    0,
    x0 - x,
    x - (x0 + nx * cell),
    y0 - y,
    y - (y0 + ny * cell)
  );
  if (off >= cap) return cap;
  let best = cap * cap;
  const R = Math.max(nx, ny);
  for (let k = 0; k <= R; k++) {
    for (let j = cj - k; j <= cj + k; j++) {
      if (j < 0 || j >= ny) continue;
      const edge = j === cj - k || j === cj + k;
      for (let i = ci - k; i <= ci + k; i += edge ? 1 : 2 * k || 1) {
        if (i < 0 || i >= nx) continue;
        const c = j * nx + i;
        for (let q = start[c]; q < start[c + 1]; q++) {
          const s = items[q];
          const ax = S[4 * s],
            ay = S[4 * s + 1],
            ex = S[4 * s + 2] - ax,
            ey = S[4 * s + 3] - ay;
          const L = ex * ex + ey * ey;
          let t = L > 0 ? ((x - ax) * ex + (y - ay) * ey) / L : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - ax - t * ex,
            dy = y - ay - t * ey;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
    }
    // every segment not yet seen is at least k·cell − off away
    if (Math.sqrt(best) <= k * cell - off) break;
  }
  return Math.min(cap, Math.sqrt(best));
}

/** Marching squares: the closed loops of {V > 0} (the border is ≤ 0), and
 *  each point's grid edge (2 (j W + i), + 1 for a vertical edge). */
function march(
  V: Float64Array,
  nx: number,
  ny: number,
  x0: number,
  y0: number,
  h: number
): { loops: Pt[][]; ids: number[][] } {
  const W = nx + 1;
  // edge ids: horizontal (i, j)-(i+1, j) is 2 (j W + i); vertical
  // (i, j)-(i, j+1) is 2 (j W + i) + 1
  const pos = new Map<number, Pt>();
  const adj = new Map<number, number[]>();
  const pt = (e: number): Pt => {
    let p = pos.get(e);
    if (p) return p;
    const q = e >> 1,
      i = q % W,
      j = (q - i) / W;
    const a = V[q],
      b = e & 1 ? V[q + W] : V[q + 1];
    const t = a / (a - b);
    p = e & 1 ? [x0 + i * h, y0 + (j + t) * h] : [x0 + (i + t) * h, y0 + j * h];
    pos.set(e, p);
    return p;
  };
  const link = (e: number, f: number) => {
    pt(e);
    pt(f);
    (adj.get(e) ?? adj.set(e, []).get(e)!).push(f);
    (adj.get(f) ?? adj.set(f, []).get(f)!).push(e);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const q = j * W + i;
      const a = V[q] > 0,
        b = V[q + 1] > 0,
        c = V[q + W + 1] > 0,
        d = V[q + W] > 0;
      const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const top = 2 * q,
        bottom = 2 * (q + W),
        left = 2 * q + 1,
        right = 2 * (q + 1) + 1;
      switch (code) {
        case 1:
        case 14:
          link(top, left);
          break;
        case 2:
        case 13:
          link(top, right);
          break;
        case 4:
        case 11:
          link(right, bottom);
          break;
        case 8:
        case 7:
          link(bottom, left);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 5:
        case 10: {
          const mid = (V[q] + V[q + 1] + V[q + W + 1] + V[q + W]) / 4 > 0;
          // a and c in (5): joined through the middle when it is in
          if ((code === 5) === mid) {
            link(top, right);
            link(bottom, left);
          } else {
            link(top, left);
            link(right, bottom);
          }
          break;
        }
      }
    }
  const seen = new Set<number>();
  const loops: Pt[][] = [];
  const ids: number[][] = [];
  for (const e0 of adj.keys()) {
    if (seen.has(e0)) continue;
    const loop: Pt[] = [];
    const id: number[] = [];
    let prev = -1,
      e = e0;
    for (let guard = 0; guard < 1e7; guard++) {
      seen.add(e);
      loop.push(pos.get(e)!);
      id.push(e);
      const nb = adj.get(e)!;
      const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = e;
      e = nxt;
      if (e === e0 || e === undefined || seen.has(e)) break;
    }
    if (loop.length >= 3) {
      loops.push(loop);
      ids.push(id);
    }
  }
  return { loops, ids };
}

// ── cutting the rings by the field ─────────────────────────────────────────

/**
 * The rings less what the field forbids: the zero level of max(sd_R, Ψ),
 * sd_R the signed distance to the rings (negative inside, nonzero
 * winding), traced by marching squares on the field's grid, outer loops
 * winding positive and holes the other way. One field, so the result has
 * no crossings whatever the rings and the forbidden ground do (a keep-out
 * wholly inside becomes a hole, parts of the outline fenced off by
 * keep-outs stay parts), and it is monotone in the rings: a larger outline
 * cuts to a larger one. Each point is marked where Ψ binds (it lies on a
 * clipped side or a keep-out) for roundCut. Where the outline is not cut it
 * is its own distance field's zero level, off it by marching squares'
 * error (≲ 0.03 px on the smoothed outlines; up to ~h/2 at a sharp corner).
 */
export function cutRings(
  F: CutField,
  rings: Pt[][]
): { rings: Pt[][]; cut: boolean[][] } {
  const { x0, y0, nx, ny, W, h, PSI, psi } = F;
  const N = W * (ny + 1);
  const S = segsOf(rings);
  const rg = new SegGrid(S, 4),
    rin = new Inside(S);
  const SD = new Float64Array(N).fill(NaN);
  const V = new Float64Array(N).fill(NaN);
  const at = (q: number) => {
    if (!Number.isNaN(V[q])) return V[q];
    const x = x0 + (q % W) * h,
      y = y0 + Math.floor(q / W) * h;
    const d = capped(rg, x, y, SURE);
    const sd = rin.has(x, y) ? -d : d;
    SD[q] = sd;
    return (V[q] = sd >= SURE ? sd : Math.max(sd, psi(q)));
  };
  quad(at, V, W, nx, ny, h, 0, (sg) => sg * 1e9);
  // marching squares traces {−V > 0}; the border is outside, so every
  // loop closes
  const U = new Float64Array(N);
  for (let q = 0; q < N; q++) U[q] = -V[q];
  for (let i = 0; i <= nx; i++) {
    U[i] = -1;
    U[ny * W + i] = -1;
  }
  for (let j = 0; j <= ny; j++) {
    U[j * W] = -1;
    U[j * W + nx] = -1;
  }
  const { loops, ids } = march(U, nx, ny, x0, y0, h);
  // where Ψ binds: at each point (on a grid edge), Ψ against sd_R there
  const cut = loops.map((L, k) =>
    ids[k].map((e) => {
      const q0 = e >> 1,
        q1 = e & 1 ? q0 + W : q0 + 1;
      const t = U[q0] / (U[q0] - U[q1]);
      const p0 = PSI[q0],
        p1 = PSI[q1];
      if (Number.isNaN(p0) || Number.isNaN(p1)) return false;
      return (1 - t) * p0 + t * p1 >= (1 - t) * SD[q0] + t * SD[q1] - 1e-9;
    })
  );
  // orient by nesting: a loop inside an even number of others is an outer
  // loop (positive), an odd number a hole
  const boxes = loops.map((L) => boxOf([L]));
  loops.forEach((L, k) => {
    const [px, py] = L[0];
    let depth = 0;
    loops.forEach((M, m) => {
      const b = boxes[m];
      if (m === k || px < b[0] || px > b[2] || py < b[1] || py > b[3]) return;
      if (pointInRing(L[0], M)) depth++;
    });
    if (signedArea2(L) > 0 !== (depth % 2 === 0)) {
      L.reverse();
      cut[k].reverse();
    }
  });
  return { rings: loops, cut };
}
