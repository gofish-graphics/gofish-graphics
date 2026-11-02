/**
 * PROTOTYPE (scratch, not for merge): keeping the pieces of one `Shape.blob`
 * apart as convexity fills them (`join` below ∞ leaves several pieces).
 *
 * Each piece i fills toward its own padded hull, so two pieces' fills can
 * meet. The rule: piece i may only fill where it is nearer than every other
 * piece by at least s,
 *
 *     allowed_i = { x : d_i(x) ≤ max(0, d_¬i(x) − s) },
 *
 * d_i the distance to piece i's spine (0 inside it), d_¬i the distance to
 * the nearest other piece's spine. Its own spine is always allowed
 * (d_i = 0), so the fill still holds every member. d_i − d_j is 2-Lipschitz,
 * so a point of allowed_i (d_i − d_j ≤ −s) and one of allowed_j (≥ s) are at
 * least s apart: two fills stay s apart, or as far apart as their spines are
 * where those are already nearer. allowed_i does not depend on convexity, so
 * a clipped fill still grows with convexity.
 *
 * The forbidden region's boundary is the zero level of
 * f = d_i − max(0, d_¬i − s), traced by marching squares on a grid of step h
 * over the box the piece can fill (its hull, or its oval above convexity 1).
 * f is evaluated exactly (nearest spine segment) at the grid's nodes, but
 * only in the coarse cells the level can cross (f is 2-Lipschitz, so a
 * coarse cell whose corners all have |f| > √2·H keeps its sign).
 *
 * `sigma` > 0 smooths the level set (Gaussian along arclength). Off by
 * default: between two bumpy spines (rows of discs) the level is bumpy, and
 * above convexity 1 the outline's own blur fades out (to land on the oval at
 * 2), so near 2 a clipped side shows the bumps. But the smoothed level bites
 * into a spine where two pieces are nearer than s, and the piece's uniform
 * outward push then grows the whole piece, so area stops growing with join
 * (U: −606 px² at join 4, c 0). TODO(prototype): smooth the level without
 * crossing the spine.
 */
import type { Pt } from "./blob";
import { SegGrid } from "./meshBlend";
import { signedArea2, pointInRing } from "../../geometry/plane";
import { resample, blur } from "./arcsSmooth";

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

/** Segments of rings as the flat array SegGrid takes. */
const segsOf = (rings: Pt[][]): Float64Array => {
  let n = 0;
  for (const r of rings) n += r.length;
  const S = new Float64Array(4 * n);
  let k = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      S[k++] = a[0];
      S[k++] = a[1];
      S[k++] = b[0];
      S[k++] = b[1];
    }
  return S;
};

/** Nonzero winding of a point over rings, by edges bucketed into rows. */
class Inside {
  y0: number;
  h: number;
  rows: number[][];
  S: Float64Array;
  constructor(S: Float64Array, h = 2) {
    this.S = S;
    const n = S.length / 4;
    let ya = Infinity,
      yb = -Infinity;
    for (let s = 0; s < n; s++) {
      ya = Math.min(ya, S[4 * s + 1], S[4 * s + 3]);
      yb = Math.max(yb, S[4 * s + 1], S[4 * s + 3]);
    }
    if (!n) [ya, yb] = [0, 1];
    this.y0 = ya;
    this.h = h;
    this.rows = Array.from(
      { length: Math.ceil((yb - ya) / h) + 1 },
      () => [] as number[]
    );
    for (let s = 0; s < n; s++) {
      const lo = Math.min(S[4 * s + 1], S[4 * s + 3]),
        hi = Math.max(S[4 * s + 1], S[4 * s + 3]);
      for (
        let j = Math.floor((lo - ya) / h);
        j <= Math.floor((hi - ya) / h);
        j++
      )
        this.rows[j].push(s);
    }
  }
  has(x: number, y: number): boolean {
    const j = Math.floor((y - this.y0) / this.h);
    if (j < 0 || j >= this.rows.length) return false;
    const S = this.S;
    let w = 0;
    for (const s of this.rows[j]) {
      const ay = S[4 * s + 1],
        by = S[4 * s + 3];
      if (ay <= y !== by <= y) {
        const ax = S[4 * s],
          bx = S[4 * s + 2];
        if (ax + ((y - ay) * (bx - ax)) / (by - ay) > x) w += by > ay ? 1 : -1;
      }
    }
    return w !== 0;
  }
}

export const SEPARATE_STATS: { ms?: number; evals?: number; nodes?: number } =
  {};

/**
 * The forbidden region of each piece, as rings (even-odd), within the box
 * each piece can fill. `spines[i]`: piece i's filled spine rings (outer
 * rings, winding positive); `boxes[i]`: the box its fill stays in.
 */
export function forbiddenRegions(
  spines: Pt[][][],
  boxes: Box[],
  s: number,
  h = 1,
  sigma = 0
): Pt[][][] {
  const t0 = performance.now();
  let evals = 0,
    nodes = 0;
  const n = spines.length;
  const sb = spines.map(boxOf);
  const own = spines.map((r) => {
    const S = segsOf(r);
    return { grid: new SegGrid(S, 4), inside: new Inside(S) };
  });
  const out: Pt[][][] = [];
  for (let i = 0; i < n; i++) {
    const [bx0, by0, bx1, by1] = boxes[i];
    // the other pieces that can be nearer than piece i somewhere in its box:
    // a point of the box is at most `reach` from piece i's spine
    const reach = Math.hypot(bx1 - bx0, by1 - by0) + s;
    const near: number[] = [];
    for (let j = 0; j < n; j++) {
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
    if (!near.length) {
      out.push([]);
      continue;
    }
    const others = near.flatMap((j) => spines[j]);
    const S = segsOf(others);
    const og = new SegGrid(S, 4),
      oin = new Inside(S);
    const me = own[i];
    // f exactly where |f| < SURE; elsewhere a value of the right sign with
    // |f| ≥ SURE (the searches stop early), enough for the refinement below
    // and for the level set (f is 2-Lipschitz, so no crossing within a step
    // of such a node)
    const SURE = 24;
    const f = (x: number, y: number) => {
      evals++;
      const di = me.inside.has(x, y) ? 0 : me.grid.nearest(x, y)[0];
      const dj = oin.has(x, y) ? 0 : capped(og, x, y, di + s + SURE);
      if (dj >= di + s + SURE) return -SURE;
      return di - Math.max(0, dj - s);
    };
    // the grid: step h, the box grown by 2 steps and the smoothing's reach
    // (so the smoothing's rounding of a loop where it is closed along the
    // border stays off the fill), the border forced allowed
    const m = Math.ceil(2 + (3 * sigma) / h);
    const x0 = bx0 - m * h,
      y0 = by0 - m * h;
    // blocks of K steps, refined by halves (a quadtree) where the level can
    // cross: a block whose corners all have one sign and |f| > √2 · its side
    // keeps that sign inside (every point is within side/√2 of a corner)
    const K = 8;
    const nx = K * Math.ceil((Math.ceil((bx1 - bx0) / h) + 2 * m) / K),
      ny = K * Math.ceil((Math.ceil((by1 - by0) / h) + 2 * m) / K);
    const W = nx + 1;
    nodes += W * (ny + 1);
    const V = new Float64Array(W * (ny + 1)).fill(NaN);
    const at = (ii: number, j: number) => {
      const q = j * W + ii;
      if (Number.isNaN(V[q])) V[q] = f(x0 + ii * h, y0 + j * h);
      return V[q];
    };
    // the blocks found sure, filled after (their nodes may be shared with
    // blocks that need them exactly)
    const sure: number[] = [];
    const refine = (i0: number, j0: number, n: number) => {
      const a = at(i0, j0),
        b = at(i0 + n, j0),
        c = at(i0, j0 + n),
        d = at(i0 + n, j0 + n);
      if (
        Math.min(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) >
          Math.SQRT2 * n * h &&
        Math.sign(a) === Math.sign(b) &&
        Math.sign(b) === Math.sign(c) &&
        Math.sign(c) === Math.sign(d)
      ) {
        sure.push(i0, j0, n, a > 0 ? 1 : -1);
        return;
      }
      if (n === 1) return;
      const k = n >> 1;
      refine(i0, j0, k);
      refine(i0 + k, j0, k);
      refine(i0, j0 + k, k);
      refine(i0 + k, j0 + k, k);
    };
    for (let j = 0; j < ny; j += K)
      for (let ii = 0; ii < nx; ii += K) refine(ii, j, K);
    for (let q = 0; q < sure.length; q += 4) {
      const [i0, j0, n, sg] = [sure[q], sure[q + 1], sure[q + 2], sure[q + 3]];
      for (let j = j0; j <= j0 + n; j++)
        for (let ii = i0; ii <= i0 + n; ii++)
          if (Number.isNaN(V[j * W + ii])) V[j * W + ii] = sg * 1e9;
    }
    for (let ii = 0; ii <= nx; ii++) {
      V[ii] = -1;
      V[ny * W + ii] = -1;
    }
    for (let j = 0; j <= ny; j++) {
      V[j * W] = -1;
      V[j * W + nx] = -1;
    }
    const loops = march(V, nx, ny, x0, y0, h);
    out.push(sigma > 0 ? blur(loops, [], sigma) : loops);
  }
  Object.assign(SEPARATE_STATS, {
    ms: performance.now() - t0,
    evals,
    nodes,
  });
  return out;
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

/** Marching squares: the closed loops of {V > 0} (the border is ≤ 0). */
function march(
  V: Float64Array,
  nx: number,
  ny: number,
  x0: number,
  y0: number,
  h: number
): Pt[][] {
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
  for (const e0 of adj.keys()) {
    if (seen.has(e0)) continue;
    const loop: Pt[] = [];
    let prev = -1,
      e = e0;
    for (let guard = 0; guard < 1e7; guard++) {
      seen.add(e);
      loop.push(pos.get(e)!);
      const nb = adj.get(e)!;
      const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = e;
      e = nxt;
      if (e === e0 || e === undefined || seen.has(e)) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// ── cutting a region out of rings ───────────────────────────────────────────

const inEvenOdd = (F: Pt[][], boxes: Box[], p: Pt) => {
  let c = false;
  for (let k = 0; k < F.length; k++) {
    const b = boxes[k];
    if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue;
    if (pointInRing(p, F[k])) c = !c;
  }
  return c;
};

const inNonzero = (rings: Pt[][], p: Pt) => {
  let w = 0;
  for (const r of rings)
    if (pointInRing(p, r)) w += signedArea2(r) > 0 ? 1 : -1;
  return w > 0;
};

/** Where segment pq crosses ring F: [t on pq, edge index of F, point]. */
function crossing(p: Pt, q: Pt, F: Pt[]): [number, number, Pt] | null {
  let best: [number, number, Pt] | null = null;
  const ex = q[0] - p[0],
    ey = q[1] - p[1];
  for (let i = 0; i < F.length; i++) {
    const a = F[i],
      b = F[(i + 1) % F.length];
    const fx = b[0] - a[0],
      fy = b[1] - a[1];
    const den = ex * fy - ey * fx;
    if (Math.abs(den) < 1e-15) continue;
    const t = ((a[0] - p[0]) * fy - (a[1] - p[1]) * fx) / den;
    const u = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
    if (!best || Math.abs(t - 0.5) < Math.abs(best[0] - 0.5))
      best = [t, i, [p[0] + t * ex, p[1] + t * ey]];
  }
  return best;
}

export const CUT_STATS: { skipped: number } = { skipped: 0 };

/**
 * The rings less the region F (even-odd rings): a run of a ring inside F
 * becomes the run of F's boundary between where it enters and leaves, the
 * way that lies inside the rings (as cutDisc does with a disc). A loop of F
 * wholly inside the rings becomes a hole.
 */
export function cutRegion(rings: Pt[][], F: Pt[][]): Pt[][] {
  if (!F.length) return rings;
  const fb = F.map((r) => boxOf([r]));
  const all = boxOf(F);
  const out: Pt[][] = [];
  const touchedF = new Set<number>();
  for (const ring0 of rings) {
    const rb = boxOf([ring0]);
    if (rb[2] < all[0] || rb[0] > all[2] || rb[3] < all[1] || rb[1] > all[3]) {
      out.push(ring0);
      continue;
    }
    const ring = resample(ring0, 0.5);
    const n = ring.length;
    const ins = ring.map((p) => inEvenOdd(F, fb, p));
    if (!ins.some((x) => x)) {
      out.push(ring0);
      continue;
    }
    if (ins.every((x) => x)) continue;
    const first = ins.findIndex((x) => !x);
    const res: Pt[] = [];
    let k = 0;
    while (k < n) {
      const i = (first + k) % n;
      if (!ins[i]) {
        res.push(ring[i]);
        k++;
        continue;
      }
      let m = k;
      while (m < n && ins[(first + m) % n]) m++;
      const p0 = ring[(first + k - 1 + n) % n],
        p1 = ring[i];
      const q0 = ring[(first + m - 1) % n],
        q1 = ring[(first + m) % n];
      // the F loop it enters and leaves through
      let enter: [number, number, Pt] | null = null,
        exit: [number, number, Pt] | null = null,
        loop = -1;
      for (let L = 0; L < F.length && loop < 0; L++) {
        const e = crossing(p0, p1, F[L]);
        const x = e && crossing(q0, q1, F[L]);
        if (e && x) [enter, exit, loop] = [e, x, L];
      }
      if (!enter || !exit) {
        // leaves through another loop than it entered: keep the run
        CUT_STATS.skipped++;
        for (let q = k; q < m; q++) res.push(ring[(first + q) % n]);
        k = m;
        continue;
      }
      touchedF.add(loop);
      const R = F[loop],
        N = R.length;
      // forward: enter.edge+1 .. exit.edge; backward: enter.edge .. exit.edge+1
      const fwd: Pt[] = [];
      for (let q = (enter[1] + 1) % N, g = 0; g < N; q = (q + 1) % N, g++) {
        fwd.push(R[q]);
        if (q === exit[1]) break;
      }
      if (enter[1] === exit[1]) fwd.length = 0;
      const bwd: Pt[] = [];
      for (let q = enter[1], g = 0; g < N; q = (q - 1 + N) % N, g++) {
        if (q === exit[1] && g > 0) break;
        if (enter[1] === exit[1]) break;
        bwd.push(R[q]);
      }
      // bwd should end at exit.edge + 1
      const pick = (A: Pt[], B: Pt[]) => {
        const mid = (P: Pt[], e0: Pt, e1: Pt): Pt =>
          P.length
            ? P[Math.floor(P.length / 2)]
            : [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2];
        const ia = inNonzero(rings, mid(A, enter![2], exit![2]));
        const ib = inNonzero(rings, mid(B, enter![2], exit![2]));
        if (ia !== ib) return ia ? A : B;
        return A.length <= B.length ? A : B;
      };
      res.push(enter[2], ...pick(fwd, bwd), exit[2]);
      k = m;
    }
    out.push(res);
  }
  // a loop of F wholly inside the rings (no crossing): a hole
  F.forEach((R, L) => {
    if (touchedF.has(L)) return;
    if (signedArea2(R) === 0) return;
    if (!inNonzero(out, R[0])) return;
    // only loops that bound forbidden ground from outside (not F's own holes)
    const inside = inEvenOdd(F, fb, interior(R));
    if (!inside) return;
    out.push(signedArea2(R) < 0 ? R : R.slice().reverse());
  });
  return out;
}

/** A point just inside ring R (beside its first edge, on its inner side). */
function interior(R: Pt[]): Pt {
  const a = R[0],
    b = R[1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const sgn = signedArea2(R) > 0 ? 1 : -1;
  // inner side: left of travel for positive winding (cross > 0)
  const nx = (-(b[1] - a[1]) / L) * sgn,
    ny = ((b[0] - a[0]) / L) * sgn;
  const m: Pt = [(a[0] + b[0]) / 2 + nx * 0.05, (a[1] + b[1]) / 2 + ny * 0.05];
  return m;
}
