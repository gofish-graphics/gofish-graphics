/**
 * PROTOTYPE (scratch, not for merge): grid tools for the two local
 * convexity treatments of unified.ts, which are not exact closings:
 *
 *  - per-bay blend (`convexityMeans: "blend"`): every pocket of the padded
 *    hull less the spine fills at the same rate. A pocket point x is filled
 *    at convexity c when u(x) ≤ c, where u is harmonic in the pocket, 0 on
 *    the spine and 1 on the hull's edge (the pocket's mouth). A harmonic u
 *    has no maximum or minimum inside the pocket (the maximum principle),
 *    so every unfilled part touches the mouth and every filled part touches
 *    the spine: no hole and no island ever forms, at any c. u depends only
 *    on the pocket's own shape, so a pocket's fill does not depend on any
 *    other pocket. (A distance ratio such as d_hull / (d_hull + d_spine)
 *    has interior maxima in a bay wider inside than at its mouth, and so
 *    leaves lakes; and filling from the mouth first walls the rest of the
 *    bay off as a hole.)
 *  - lid (`seal: "lid"`): a bay that seals at r_s (the closing fills it all
 *    at once) is instead kept open at r_s and filled from its far end
 *    toward its mouth as r grows: a bay point closes once its distance from
 *    the open outside, measured inside the bay, is more than r_e − r, with
 *    r_e = r_s + G and G the bay's depth (its farthest point from the
 *    outside). The fill front moves one pixel deeper per pixel of radius,
 *    the mouth closes last (so the open part always reaches the outside and
 *    no hole forms), and at r_e the outline is the exact closing again.
 *
 * Both are drawn as the zero set of a field sampled on a grid (marching
 * squares), whose terms are signed distances in px to exact outlines, exact
 * within a narrow band of each, so the outline is continuous with the exact
 * closings it starts and ends at. Between those ends it is the grid
 * contour, then smoothed like every outline.
 */
import type { Pt } from "./blob";
import { signedArea2 } from "../../geometry/plane";

export type Grid = {
  x0: number;
  y0: number;
  h: number;
  nx: number;
  ny: number;
};

/** A grid over the rings' box, grown by a margin, of at most ~maxNodes
 *  nodes and spacing at least hMin px. */
export function gridFor(rings: Pt[][], hMin = 1, maxNodes = 250_000): Grid {
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < xa) xa = x;
      if (x > xb) xb = x;
      if (y < ya) ya = y;
      if (y > yb) yb = y;
    }
  const h = Math.max(hMin, Math.sqrt(((xb - xa) * (yb - ya)) / maxNodes));
  const m = 4 * h + 2;
  const x0 = xa - m,
    y0 = ya - m;
  return {
    x0,
    y0,
    h,
    nx: Math.ceil((xb + m - x0) / h) + 1,
    ny: Math.ceil((yb + m - y0) / h) + 1,
  };
}

/**
 * The signed distance to the region the rings bound (nonzero winding:
 * negative inside), at every node: exact within `band` px of the boundary,
 * ±band beyond it.
 */
export function signedDistance(
  rings: Pt[][],
  G: Grid,
  band: number
): Float32Array {
  const { x0, y0, h, nx, ny } = G;
  const n = nx * ny;
  const out = new Float32Array(n);
  // winding, row by row
  const rows: number[][] = Array.from({ length: ny }, () => []);
  let nSeg = 0;
  for (const r of rings) nSeg += r.length;
  const S = new Float64Array(4 * nSeg);
  let k = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      S[4 * k] = a[0];
      S[4 * k + 1] = a[1];
      S[4 * k + 2] = b[0];
      S[4 * k + 3] = b[1];
      k++;
      if (a[1] === b[1]) continue;
      const lo = Math.min(a[1], b[1]),
        hi = Math.max(a[1], b[1]);
      const j0 = Math.max(0, Math.ceil((lo - y0) / h)),
        j1 = Math.min(ny - 1, Math.ceil((hi - y0) / h) - 1);
      const dir = b[1] > a[1] ? 1 : -1;
      for (let j = j0; j <= j1; j++) {
        const y = y0 + j * h;
        rows[j].push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), dir);
      }
    }
  for (let j = 0; j < ny; j++) {
    const row = rows[j];
    const m = row.length / 2;
    const idx = Array.from({ length: m }, (_, q) => q).sort(
      (p, q) => row[2 * p] - row[2 * q]
    );
    let w = 0,
      q = 0;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * h;
      while (q < m && row[2 * idx[q]] <= x) w += row[2 * idx[q++] + 1];
      out[j * nx + i] = w !== 0 ? -band : band;
    }
  }
  // exact distance near the boundary: segments bucketed by `band` cells
  const B = Math.max(band, 2 * h);
  const bx = Math.ceil((nx * h) / B) + 1,
    by = Math.ceil((ny * h) / B) + 1;
  const buckets: number[][] = Array.from({ length: bx * by }, () => []);
  for (let s = 0; s < nSeg; s++) {
    const ax = S[4 * s],
      ay = S[4 * s + 1],
      cx = S[4 * s + 2],
      cy = S[4 * s + 3];
    const i0 = Math.max(0, Math.floor((Math.min(ax, cx) - band - x0) / B)),
      i1 = Math.min(bx - 1, Math.floor((Math.max(ax, cx) + band - x0) / B)),
      j0 = Math.max(0, Math.floor((Math.min(ay, cy) - band - y0) / B)),
      j1 = Math.min(by - 1, Math.floor((Math.max(ay, cy) + band - y0) / B));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) buckets[j * bx + i].push(s);
  }
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * h;
    const bj = Math.floor((y - y0) / B);
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * h;
      const list = buckets[bj * bx + Math.floor((x - x0) / B)];
      if (!list.length) continue;
      let d2 = band * band;
      for (const s of list) {
        const ax = S[4 * s],
          ay = S[4 * s + 1],
          ex = S[4 * s + 2] - ax,
          ey = S[4 * s + 3] - ay;
        const L = ex * ex + ey * ey;
        let t = L > 0 ? ((x - ax) * ex + (y - ay) * ey) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - t * ex,
          dy = y - ay - t * ey;
        const dd = dx * dx + dy * dy;
        if (dd < d2) d2 = dd;
      }
      const v = j * nx + i;
      out[v] = Math.sign(out[v]) * Math.sqrt(d2);
    }
  }
  return out;
}

/**
 * The zero set of a field on the grid (marching squares), as closed rings
 * around its nonpositive part. Outer rings wind with positive signedArea2,
 * holes the other way (the closing's convention); a ring under minArea px²
 * is dropped.
 */
export function contour(F: Float32Array, G: Grid, minArea = 1): Pt[][] {
  const { x0, y0, h, nx, ny } = G;
  const n = nx * ny;
  const next = new Int32Array(2 * n).fill(-1);
  const px = new Float64Array(2 * n),
    py = new Float64Array(2 * n);
  // an edge's crossing, from its canonical first node a to its second b
  const cross = (id: number, a: number, b: number) => {
    const fa = F[a],
      fb = F[b];
    let t = fa / (fa - fb);
    if (!(t >= 0)) t = 0;
    else if (t > 1) t = 1;
    const ia = a % nx,
      ja = (a / nx) | 0,
      ib = b % nx,
      jb = (b / nx) | 0;
    px[id] = x0 + h * (ia + t * (ib - ia));
    py[id] = y0 + h * (ja + t * (jb - ja));
  };
  const ids = [0, 0, 0, 0],
    exits = [false, false, false, false];
  for (let j = 0; j + 1 < ny; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const c0 = j * nx + i,
        c1 = c0 + 1,
        c2 = c0 + nx + 1,
        c3 = c0 + nx;
      const s0 = F[c0] <= 0,
        s1 = F[c1] <= 0,
        s2 = F[c2] <= 0,
        s3 = F[c3] <= 0;
      if (s0 === s1 && s1 === s2 && s2 === s3) continue;
      // edges in cyclic order c0→c1→c2→c3→c0, each with its id and nodes
      let m = 0;
      const edge = (
        si: boolean,
        sj: boolean,
        id: number,
        a: number,
        b: number
      ) => {
        if (si === sj) return;
        if (px[id] === 0 && py[id] === 0) cross(id, a, b);
        ids[m] = id;
        exits[m] = si; // inside → outside along the cycle
        m++;
      };
      edge(s0, s1, c0, c0, c1);
      edge(s1, s2, n + c1, c1, c2);
      edge(s2, s3, c3, c3, c2);
      edge(s3, s0, n + c0, c0, c3);
      if (m === 2) {
        const [e, f] = exits[0] ? [0, 1] : [1, 0];
        next[ids[e]] = ids[f];
      } else if (m === 4) {
        const centerIn = F[c0] + F[c1] + F[c2] + F[c3] <= 0;
        for (let q = 0; q < 4; q++) {
          if (!exits[q]) continue;
          const f = centerIn ? (q + 1) % 4 : (q + 3) % 4;
          next[ids[q]] = ids[f];
        }
      }
    }
  const seen = new Uint8Array(2 * n);
  const rings: Pt[][] = [];
  for (let s = 0; s < 2 * n; s++) {
    if (next[s] < 0 || seen[s]) continue;
    const ring: Pt[] = [];
    let e = s;
    while (e >= 0 && !seen[e]) {
      seen[e] = 1;
      ring.push([px[e], py[e]]);
      e = next[e];
    }
    if (ring.length > 2) rings.push(ring);
  }
  // the filled side on the left as the closing winds: total area positive
  const total = rings.reduce((t, r) => t + signedArea2(r), 0);
  const out = total < 0 ? rings.map((r) => r.reverse()) : rings;
  return out.filter((r) => Math.abs(signedArea2(r)) / 2 >= minArea);
}

/** A binary min-heap of node indices keyed by a value. */
class Heap {
  v: number[] = [];
  k: number[] = [];
  push(i: number, key: number) {
    const { v, k } = this;
    let a = v.length;
    v.push(i);
    k.push(key);
    while (a > 0) {
      const p = (a - 1) >> 1;
      if (k[p] <= k[a]) break;
      [v[p], v[a]] = [v[a], v[p]];
      [k[p], k[a]] = [k[a], k[p]];
      a = p;
    }
  }
  pop(): [number, number] {
    const { v, k } = this;
    const top: [number, number] = [v[0], k[0]];
    const lv = v.pop()!,
      lk = k.pop()!;
    if (v.length) {
      v[0] = lv;
      k[0] = lk;
      let a = 0;
      for (;;) {
        const l = 2 * a + 1,
          r = l + 1;
        let m = a;
        if (l < v.length && k[l] < k[m]) m = l;
        if (r < v.length && k[r] < k[m]) m = r;
        if (m === a) break;
        [v[m], v[a]] = [v[a], v[m]];
        [k[m], k[a]] = [k[a], k[m]];
        a = m;
      }
    }
    return top;
  }
  get size() {
    return this.v.length;
  }
}

/** Shortest-path distance inside `mask` from sources (init: a start value
 *  per node, Infinity elsewhere), over the 8 neighbors. */
export function geodesic(
  mask: Uint8Array,
  init: Float64Array,
  G: Grid
): Float64Array {
  const { nx, ny, h } = G;
  const d = init.slice();
  const H = new Heap();
  for (let v = 0; v < d.length; v++)
    if (mask[v] && d[v] < Infinity) H.push(v, d[v]);
  const D = h * Math.SQRT2;
  const steps = [
    [1, 0, h],
    [-1, 0, h],
    [0, 1, h],
    [0, -1, h],
    [1, 1, D],
    [1, -1, D],
    [-1, 1, D],
    [-1, -1, D],
  ];
  while (H.size) {
    const [v, dv] = H.pop();
    if (dv > d[v]) continue;
    const i = v % nx,
      j = (v / nx) | 0;
    for (const [di, dj, w] of steps) {
      const a = i + di,
        b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const u = b * nx + a;
      if (!mask[u]) continue;
      const nd = dv + w;
      if (nd < d[u]) {
        d[u] = nd;
        H.push(u, nd);
      }
    }
  }
  return d;
}

/** The 4-connected component of `mask` holding node `seed`. */
export function component(mask: Uint8Array, seed: number, G: Grid): Uint8Array {
  const { nx, ny } = G;
  const out = new Uint8Array(mask.length);
  if (!mask[seed]) return out;
  const stack = [seed];
  out[seed] = 1;
  while (stack.length) {
    const v = stack.pop()!;
    const i = v % nx,
      j = (v / nx) | 0;
    const nb = [
      i > 0 ? v - 1 : -1,
      i + 1 < nx ? v + 1 : -1,
      j > 0 ? v - nx : -1,
      j + 1 < ny ? v + nx : -1,
    ];
    for (const u of nb)
      if (u >= 0 && mask[u] && !out[u]) {
        out[u] = 1;
        stack.push(u);
      }
  }
  return out;
}

/** All 4-connected components of `mask`, as a label per node (0: none) and
 *  each component's size. */
export function components(
  mask: Uint8Array,
  G: Grid
): { label: Int32Array; sizes: number[] } {
  const { nx, ny } = G;
  const label = new Int32Array(mask.length);
  const sizes = [0];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const v = stack.pop()!;
      size++;
      const i = v % nx,
        j = (v / nx) | 0;
      const nb = [
        i > 0 ? v - 1 : -1,
        i + 1 < nx ? v + 1 : -1,
        j > 0 ? v - nx : -1,
        j + 1 < ny ? v + nx : -1,
      ];
      for (const u of nb)
        if (u >= 0 && mask[u] && !label[u]) {
          label[u] = id;
          stack.push(u);
        }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

// ── per-bay blend ───────────────────────────────────────────────────────────

export type Blend = {
  G: Grid;
  sdS: Float32Array;
  sdH: Float32Array;
  /** the fill level per pocket node (NaN off the pockets), and its slope
   *  per px (so (u − c) / slope is about a distance in px) */
  u: Float32Array;
  slope: Float32Array;
  /** each node's pocket (0: none) and each pocket's levels u, sorted: a
   *  pocket fills share c of its own area at the level its nodes' c-th
   *  quantile of u */
  label: Int32Array;
  levels: Float64Array[];
  pockets: number;
  iterations: number;
  ms: number;
};

/**
 * The fill level u of every pocket of hull − spine: harmonic, 0 on the
 * spine and 1 on the hull's edge, solved by red-black SOR with the
 * Shortley-Weller stencil (each boundary crossing placed where the exact
 * signed distances put it, not at the grid node). A pocket with no mouth (a
 * hole of the spine, only with `holes`) gets u = its distance from its wall
 * over its greatest such distance: it shrinks evenly and is gone at 1.
 */
export function buildBlend(spine: Pt[][], hull: Pt[], hMin = 1): Blend {
  const t0 = performance.now();
  const G = gridFor([hull], hMin);
  const { nx, ny, h } = G;
  const n = nx * ny;
  const band = 3 * h;
  const sdS = signedDistance(spine, G, band);
  const sdH = signedDistance([hull], G, band);
  // pocket nodes: inside the hull, outside the spine
  const pocket = new Uint8Array(n);
  for (let v = 0; v < n; v++) pocket[v] = sdH[v] < 0 && sdS[v] > 0 ? 1 : 0;
  const { label, sizes } = components(pocket, G);
  // which components have a mouth (a node next to the hull's outside)
  const mouth = new Uint8Array(sizes.length);
  const nbs = (v: number) => {
    const i = v % nx,
      j = (v / nx) | 0;
    return [
      i + 1 < nx ? v + 1 : -1,
      i > 0 ? v - 1 : -1,
      j + 1 < ny ? v + nx : -1,
      j > 0 ? v - nx : -1,
    ];
  };
  for (let v = 0; v < n; v++)
    if (pocket[v])
      for (const q of nbs(v)) if (q >= 0 && sdH[q] >= 0) mouth[label[v]] = 1;
  // the stencil: per unknown, its 4 neighbors' weights (or a fixed value)
  const idx = new Int32Array(n).fill(-1);
  const nodes: number[] = [];
  for (let v = 0; v < n; v++)
    if (pocket[v] && mouth[label[v]]) {
      idx[v] = nodes.length;
      nodes.push(v);
    }
  const m = nodes.length;
  const W = new Float64Array(4 * m),
    NB = new Int32Array(4 * m).fill(-1),
    rhs = new Float64Array(m),
    diag = new Float64Array(m),
    // the distance and value toward each neighbor, for the slope
    HD = new Float64Array(4 * m),
    VAL = new Float64Array(4 * m);
  for (let k = 0; k < m; k++) {
    const v = nodes[k];
    const q4 = nbs(v);
    const hs = [h, h, h, h],
      fixed = [NaN, NaN, NaN, NaN];
    for (let d = 0; d < 4; d++) {
      const q = q4[d];
      if (q < 0) continue;
      if (sdS[q] <= 0) {
        const th = Math.max(0.02, Math.min(1, sdS[v] / (sdS[v] - sdS[q])));
        hs[d] = th * h;
        fixed[d] = 0;
      } else if (sdH[q] >= 0) {
        const th = Math.max(0.02, Math.min(1, -sdH[v] / (sdH[q] - sdH[v])));
        hs[d] = th * h;
        fixed[d] = 1;
      }
    }
    // x: d 0 (east), 1 (west); y: d 2, 3
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ]) {
      const s = hs[a] + hs[b];
      const wa = 2 / (hs[a] * s),
        wb = 2 / (hs[b] * s);
      for (const [d, w] of [
        [a, wa],
        [b, wb],
      ] as [number, number][]) {
        diag[k] += w;
        HD[4 * k + d] = hs[d];
        if (Number.isNaN(fixed[d])) {
          W[4 * k + d] = w;
          NB[4 * k + d] = idx[q4[d]];
          VAL[4 * k + d] = NaN;
        } else {
          rhs[k] += w * fixed[d];
          VAL[4 * k + d] = fixed[d];
        }
      }
    }
  }
  // initial guess: the share of the way from the spine to the hull edge,
  // by the (band-limited) distances, then red-black SOR
  const U = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const v = nodes[k];
    U[k] = Math.min(1, Math.max(0, sdS[v] / (sdS[v] - sdH[v])));
  }
  const red: number[] = [],
    black: number[] = [];
  for (let k = 0; k < m; k++) {
    const v = nodes[k];
    ((v % nx) + ((v / nx) | 0)) % 2 ? black.push(k) : red.push(k);
  }
  const span = Math.max(4, Math.sqrt(m));
  const omega = 2 / (1 + Math.sin(Math.PI / span));
  let it = 0;
  for (; it < 4000; it++) {
    let delta = 0;
    for (const set of [red, black])
      for (const k of set) {
        let s = rhs[k];
        for (let d = 0; d < 4; d++) {
          const q = NB[4 * k + d];
          if (q >= 0) s += W[4 * k + d] * U[q];
        }
        const nu = s / diag[k];
        const ch = omega * (nu - U[k]);
        U[k] += ch;
        if (Math.abs(ch) > delta) delta = Math.abs(ch);
      }
    if (delta < 1e-6) break;
  }
  const u = new Float32Array(n).fill(NaN),
    slope = new Float32Array(n).fill(NaN);
  const valAt = (k: number, d: number) => {
    const q = NB[4 * k + d];
    return q >= 0 ? U[q] : VAL[4 * k + d];
  };
  for (let k = 0; k < m; k++) {
    const v = nodes[k];
    u[v] = Math.min(1, Math.max(0, U[k]));
    const has = (d: number) =>
      NB[4 * k + d] >= 0 || !Number.isNaN(VAL[4 * k + d]);
    const gx =
      has(0) && has(1)
        ? (valAt(k, 0) - valAt(k, 1)) / (HD[4 * k] + HD[4 * k + 1])
        : 0;
    const gy =
      has(2) && has(3)
        ? (valAt(k, 2) - valAt(k, 3)) / (HD[4 * k + 2] + HD[4 * k + 3])
        : 0;
    slope[v] = Math.max(1e-4, Math.hypot(gx, gy));
  }
  // pockets with no mouth (holes): distance from the wall, shrinking evenly
  const holeMask = new Uint8Array(n);
  for (let v = 0; v < n; v++)
    if (pocket[v] && !mouth[label[v]]) holeMask[v] = 1;
  if (holeMask.some((x) => x)) {
    const init = new Float64Array(n).fill(Infinity);
    for (let v = 0; v < n; v++)
      if (holeMask[v] && nbs(v).some((q) => q >= 0 && sdS[q] <= 0))
        init[v] = Math.max(0, sdS[v]);
    const g = geodesic(holeMask, init, G);
    const most = new Float64Array(sizes.length);
    for (let v = 0; v < n; v++)
      if (holeMask[v] && g[v] < Infinity)
        most[label[v]] = Math.max(most[label[v]], g[v]);
    for (let v = 0; v < n; v++)
      if (holeMask[v]) {
        const M = most[label[v]] || 1;
        u[v] = Math.min(1, g[v] / M);
        slope[v] = 1 / M;
      }
  }
  const lists: number[][] = sizes.map(() => []);
  for (let v = 0; v < n; v++)
    if (label[v] && !Number.isNaN(u[v])) lists[label[v]].push(u[v]);
  const levels = lists.map((l) => Float64Array.from(l).sort());
  return {
    G,
    sdS,
    sdH,
    u,
    slope,
    label,
    levels,
    pockets: sizes.length - 1,
    iterations: it,
    ms: performance.now() - t0,
  };
}

/** The level at which a pocket has filled share c of its area: the c-th
 *  quantile of its nodes' u, from 0 at c = 0 to 1 at c = 1. */
export function levelFor(levels: Float64Array, c: number): number {
  const m = levels.length;
  if (m === 0) return c;
  // the sorted levels with 0 and 1 at the ends, read at position c·(m+1)
  const x = c * (m + 1);
  const k = Math.floor(x);
  const at = (q: number) => (q <= 0 ? 0 : q > m ? 1 : levels[q - 1]);
  return at(k) + (x - k) * (at(k + 1) - at(k));
}

/** The blend's region at convexity c in (0, 1): the spine and, in every
 *  pocket, the points whose u is at most the pocket's level for c (so each
 *  pocket fills share c of its own area), as the zero set of
 *  min(sdS, max(sdH, (u − level) / slope)). */
export function blendRings(B: Blend, c: number, holes: boolean): Pt[][] {
  const { sdS, sdH, u, slope, G, label, levels } = B;
  const n = sdS.length;
  const lv = levels.map((l) => levelFor(l, c));
  const F = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    if (sdS[v] <= 0) F[v] = sdS[v];
    else if (sdH[v] >= 0) F[v] = sdH[v];
    else if (Number.isNaN(u[v])) F[v] = Math.min(sdS[v], -sdH[v]);
    else
      F[v] = Math.min(
        sdS[v],
        Math.max(sdH[v], (u[v] - lv[label[v]]) / slope[v])
      );
  }
  const rings = contour(F, G);
  return holes ? rings : rings.filter((r) => signedArea2(r) > 0);
}

// ── lid ─────────────────────────────────────────────────────────────────────

/** A sealing bay, for the lid: its seal radius and end radius, the exact
 *  closing just before the seal (as a signed distance on the shared grid),
 *  a node deep in the bay, and the bay's nodes' depths (sorted) for the
 *  area lookup. */
export type Seal = {
  rs: number;
  re: number;
  depth: number;
  sdBefore: Float32Array;
  seed: number;
  depths: Float64Array;
  /** the area the filtration says the seal adds, px², and the radius it
   *  adds it at (its sampled seal radius, a few hundredths off rs) */
  dA: number;
  rk?: number;
};

/** The depth of every node of the bay `bay` (inside F, outside the closing
 *  before the seal): its distance inside the bay from F's outside. */
function depthIn(bay: Uint8Array, sdF: Float32Array, G: Grid): Float64Array {
  const { nx, ny } = G;
  const init = new Float64Array(bay.length).fill(Infinity);
  for (let v = 0; v < bay.length; v++) {
    if (!bay[v]) continue;
    const i = v % nx,
      j = (v / nx) | 0;
    const out =
      (i + 1 < nx && sdF[v + 1] > 0) ||
      (i > 0 && sdF[v - 1] > 0) ||
      (j + 1 < ny && sdF[v + nx] > 0) ||
      (j > 0 && sdF[v - nx] > 0);
    if (out) init[v] = Math.max(0, -sdF[v]);
  }
  return geodesic(bay, init, G);
}

/**
 * The seal at sampled radius rs: the exact closings at rs ∓ margin, the bay
 * (the largest piece they differ by), its depth G and end radius rs + G.
 * Null when the closings do not differ there (no bay).
 */
export function buildSeal(
  before: Pt[][],
  after: Pt[][],
  rs: number,
  dA: number,
  G: Grid
): Seal | null {
  const band = 3 * G.h;
  const sdBefore = signedDistance(before, G, band);
  const sdAfter = signedDistance(after, G, band);
  const n = sdBefore.length;
  const diff = new Uint8Array(n);
  for (let v = 0; v < n; v++)
    diff[v] = sdAfter[v] <= 0 && sdBefore[v] > 0 ? 1 : 0;
  const { label, sizes } = components(diff, G);
  let best = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k;
  if (!best || sizes[best] < 8) return null;
  const bay = new Uint8Array(n);
  for (let v = 0; v < n; v++) bay[v] = label[v] === best ? 1 : 0;
  const g = depthIn(bay, sdAfter, G);
  let seed = -1,
    depth = 0;
  const ds: number[] = [];
  for (let v = 0; v < n; v++)
    if (bay[v] && g[v] < Infinity) {
      ds.push(g[v]);
      if (g[v] > depth) [depth, seed] = [g[v], v];
    }
  if (seed < 0) return null;
  return {
    rs,
    re: rs + depth,
    depth,
    sdBefore,
    seed,
    depths: Float64Array.from(ds).sort(),
    dA,
  };
}

/** The share of the bay (as at its seal) still open at radius r: the share
 *  of its nodes no deeper than re − r. */
export function sealOpenShare(s: Seal, r: number): number {
  // from the filtration's own seal radius, where its area jumps, so the
  // area lookup stays monotone
  if (r < (s.rk ?? s.rs) || r >= s.re) return 0;
  const t = s.re - r;
  const a = s.depths;
  let lo = 0,
    hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo / a.length;
}

/**
 * The lid's region at radius r: the exact closing `rings` (at r) less, in
 * each sealed bay still filling, the part within re − r of the outside
 * (measured inside the bay), as the zero set of
 * max(sdF, max over bays of min(sdBefore, (re − r) − depth)).
 * Null when no bay is filling at r (the exact closing stands).
 */
export function lidRings(
  rings: Pt[][],
  r: number,
  seals: Seal[],
  G: Grid,
  holes: boolean
): { rings: Pt[][]; active: number } | null {
  const live = seals.filter((s) => r > s.rs - 0.2 && r < s.re);
  if (!live.length) return null;
  const band = 3 * G.h;
  const sdF = signedDistance(rings, G, band);
  const n = sdF.length;
  const { nx, ny } = G;
  const Phi = Float32Array.from(sdF);
  let active = 0;
  for (const s of live) {
    const mask = new Uint8Array(n);
    for (let v = 0; v < n; v++)
      mask[v] = sdF[v] <= 0 && s.sdBefore[v] > 0 ? 1 : 0;
    const bay = component(mask, s.seed, G);
    if (!bay[s.seed]) continue;
    active++;
    const g = depthIn(bay, sdF, G);
    const t = s.re - r;
    for (let v = 0; v < n; v++) {
      if (bay[v]) {
        const w = Math.min(s.sdBefore[v], t - g[v]);
        if (w > Phi[v]) Phi[v] = w;
        continue;
      }
      // the bay's wall: the closing before the seal
      if (s.sdBefore[v] > 0) continue;
      const i = v % nx,
        j = (v / nx) | 0;
      const near =
        (i + 1 < nx && bay[v + 1]) ||
        (i > 0 && bay[v - 1]) ||
        (j + 1 < ny && bay[v + nx]) ||
        (j > 0 && bay[v - nx]);
      if (near && s.sdBefore[v] > Phi[v]) Phi[v] = s.sdBefore[v];
    }
  }
  if (!active) return null;
  const out = contour(Phi, G);
  return {
    rings: holes ? out : out.filter((q) => signedArea2(q) > 0),
    active,
  };
}
