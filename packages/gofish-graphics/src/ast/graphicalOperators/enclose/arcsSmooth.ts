/**
 * PROTOTYPE (scratch, not for merge): smoothing passes run after the exact
 * arcs closing, to take out the small bumps where one padded member sticks
 * out a little past its neighbors (a convex arc of the padded member's radius
 * between two concave arcs of the closing radius). Selected by
 * `ARCS_PROTOTYPE.smooth` in arcs.ts. Each pass keeps every padded member
 * (and each spine link, at its padded half-width) inside the outline.
 */
import type { Pt } from "./blob";
import { pointInRing, segDist, signedArea2 } from "../../geometry/plane";
import { SegGrid, Inside, segsOf } from "./meshBlend";

/** A keep-in constraint: a segment ab (a disc when a = b) grown to `R`. The
 *  outline must keep every point of it inside. */
export type KeepIn = { a: Pt; b: Pt; R: number };

export type SmoothSpec =
  | {
      /** Alternate a Gaussian along arc length (sigma px) with pushing every
       *  point out of the keep-in capsules; `iters` rounds. */
      kind: "relax";
      sigma: number;
      iters: number;
    }
  | {
      /** The same Gaussian, but each point only moves outward (along its
       *  normal), so the result holds the closing: concave parts fill, convex
       *  parts stay. `iters` rounds. */
      kind: "outward";
      sigma: number;
      iters: number;
    }
  | {
      /** A Gaussian along arc length (sigma px), then the whole outline moved
       *  out along its normals by the least amount that holds every keep-in
       *  capsule again (smoothing pulls convex parts in by about
       *  sigma^2 / (2 rho)). */
      kind: "blur";
      sigma: number;
      /** Run the closing this much nearer the members (padding - inset), so
       *  the offset lands the straight runs back at about the padding. */
      inset?: number;
      /** When set, the outward offset is local (see blurLocal), tapering
       *  over this many px along the outline, instead of one uniform offset. */
      local?: number;
      /** The offset's margin past the least that holds every capsule, px
       *  (default 0.05). */
      margin?: number;
    }
  | {
      /** The signed distance to the closing, blurred by a Gaussian of sigma
       *  px on a grid of `cell` px, contoured at the lowest level that still
       *  holds every keep-in capsule. */
      kind: "field";
      sigma: number;
      cell?: number;
    };

/** Resample a closed ring at a uniform step of about ds. */
export function resample(ring: Pt[], ds: number): Pt[] {
  const n = ring.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % n]];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n];
  const m = Math.max(8, Math.round(L / ds));
  const out: Pt[] = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const s = (L * j) / m;
    while (cum[k + 1] < s) k++;
    const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const [a, b] = [ring[k], ring[(k + 1) % n]];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function gauss(ring: Pt[], sigmaSamples: number): Pt[] {
  const n = ring.length;
  const J = Math.min(Math.floor(n / 2) - 1, Math.ceil(3 * sigmaSamples));
  const w: number[] = [];
  let z = 0;
  for (let j = -J; j <= J; j++) {
    const v = Math.exp(-(j * j) / (2 * sigmaSamples * sigmaSamples));
    w.push(v);
    z += v;
  }
  return ring.map((_, i) => {
    let x = 0,
      y = 0;
    for (let j = -J; j <= J; j++) {
      const q = ring[(((i + j) % n) + n) % n];
      x += w[j + J] * q[0];
      y += w[j + J] * q[1];
    }
    return [x / z, y / z] as Pt;
  });
}

/** Push p out of every keep-in capsule that holds it. */
function pushOut(p: Pt, keep: KeepIn[]): Pt {
  let [x, y] = p;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const k of keep) {
      const [a, b] = [k.a, k.b];
      const ex = b[0] - a[0],
        ey = b[1] - a[1];
      const L2 = ex * ex + ey * ey;
      const t =
        L2 < 1e-12
          ? 0
          : Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2));
      const cx = a[0] + ex * t,
        cy = a[1] + ey * t;
      const d = Math.hypot(x - cx, y - cy);
      if (d < k.R && d > 1e-9) {
        x = cx + ((x - cx) * k.R) / d;
        y = cy + ((y - cy) * k.R) / d;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, y];
}

/** The outward normals of a ring (winding positive in screen coordinates,
 *  as the arcs outline does). */
function normals(ring: Pt[], material = false): Pt[] {
  const n = ring.length;
  // material: the region is on the left of travel on every ring (an outer
  // ring winds positive, a hole the other way), so outward is always right.
  const sgn = material || signedArea2(ring) > 0 ? 1 : -1;
  return ring.map((_, i) => {
    const [p, q] = [ring[(i - 1 + n) % n], ring[(i + 1) % n]];
    const tx = q[0] - p[0],
      ty = q[1] - p[1];
    const L = Math.hypot(tx, ty) || 1;
    // right of travel is outside for positive signed area
    return [(sgn * ty) / L, (-sgn * tx) / L] as Pt;
  });
}

export function relax(
  ring: Pt[],
  keep: KeepIn[],
  sigma: number,
  iters: number
): Pt[] {
  const ds = 1;
  let r = resample(ring, ds);
  for (let it = 0; it < iters; it++) {
    r = gauss(r, sigma / ds).map((p) => pushOut(p, keep));
    r = resample(r, ds);
  }
  return r;
}

export function outward(
  ring: Pt[],
  keep: KeepIn[],
  sigma: number,
  iters: number
): Pt[] {
  const ds = 1;
  let r = resample(ring, ds);
  for (let it = 0; it < iters; it++) {
    const g = gauss(r, sigma / ds);
    const N = normals(r);
    r = r.map((p, i) => {
      const dx = g[i][0] - p[0],
        dy = g[i][1] - p[1];
      const s = Math.max(0, dx * N[i][0] + dy * N[i][1]);
      return pushOut([p[0] + s * N[i][0], p[1] + s * N[i][1]], keep);
    });
    r = resample(r, ds);
  }
  return r;
}

/** Signed distance to a set of rings (negative inside). */
function ringsSdf(rings: Pt[][], x: number, y: number): number {
  let d = Infinity,
    inside = false;
  for (const ring of rings) {
    if (pointInRing([x, y], ring)) inside = !inside;
    for (let i = 0; i < ring.length; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
      d = Math.min(d, segDist(x, y, a[0], a[1], b[0], b[1]));
    }
  }
  return inside ? -d : d;
}

/** Marching squares of field f (nx × ny, cell size h, origin ox, oy) at
 *  level c: the closed loops of {f <= c}. */
function contour(
  f: Float64Array,
  nx: number,
  ny: number,
  h: number,
  ox: number,
  oy: number,
  c: number
): Pt[][] {
  // edge-keyed segments, then chain
  const P = (i: number, j: number) => f[j * nx + i] - c;
  const key = (i: number, j: number, d: 0 | 1) => (j * nx + i) * 2 + d;
  const pt = (i: number, j: number, d: 0 | 1): Pt => {
    // d = 0: edge (i,j)-(i+1,j); d = 1: edge (i,j)-(i,j+1)
    const a = P(i, j),
      b = d === 0 ? P(i + 1, j) : P(i, j + 1);
    const t = a / (a - b);
    return d === 0
      ? [ox + (i + t) * h, oy + j * h]
      : [ox + i * h, oy + (j + t) * h];
  };
  const next = new Map<number, number>();
  const where = new Map<number, Pt>();
  for (let j = 0; j + 1 < ny; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const v0 = P(i, j) <= 0 ? 1 : 0,
        v1 = P(i + 1, j) <= 0 ? 1 : 0,
        v2 = P(i + 1, j + 1) <= 0 ? 1 : 0,
        v3 = P(i, j + 1) <= 0 ? 1 : 0;
      const code = v0 | (v1 << 1) | (v2 << 2) | (v3 << 3);
      if (code === 0 || code === 15) continue;
      const T = key(i, j, 0),
        R = key(i + 1, j, 1),
        B = key(i, j + 1, 0),
        L = key(i, j, 1);
      for (const [k, ii, jj, d] of [
        [T, i, j, 0],
        [R, i + 1, j, 1],
        [B, i, j + 1, 0],
        [L, i, j, 1],
      ] as [number, number, number, 0 | 1][])
        if (!where.has(k)) where.set(k, pt(ii, jj, d));
      // segments oriented with inside on the left (screen y-down: ccw area>0)
      const segs: [number, number][] = [];
      switch (code) {
        case 1:
          segs.push([L, T]);
          break;
        case 2:
          segs.push([T, R]);
          break;
        case 3:
          segs.push([L, R]);
          break;
        case 4:
          segs.push([R, B]);
          break;
        case 5:
          segs.push([L, T], [R, B]);
          break;
        case 6:
          segs.push([T, B]);
          break;
        case 7:
          segs.push([L, B]);
          break;
        case 8:
          segs.push([B, L]);
          break;
        case 9:
          segs.push([B, T]);
          break;
        case 10:
          segs.push([T, R], [B, L]);
          break;
        case 11:
          segs.push([B, R]);
          break;
        case 12:
          segs.push([R, L]);
          break;
        case 13:
          segs.push([R, T]);
          break;
        case 14:
          segs.push([T, L]);
          break;
      }
      for (const [a, b] of segs) next.set(a, b);
    }
  const loops: Pt[][] = [];
  const seen = new Set<number>();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop: Pt[] = [];
    let k: number | undefined = s;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(where.get(k)!);
      k = next.get(k);
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

export function field(
  rings: Pt[][],
  keep: KeepIn[],
  sigma: number,
  cell = 1
): Pt[][] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const m = 3 * sigma + 4;
  const ox = x0 - m,
    oy = y0 - m;
  const nx = Math.ceil((x1 - x0 + 2 * m) / cell) + 1,
    ny = Math.ceil((y1 - y0 + 2 * m) / cell) + 1;
  // the distance: exact near the outline is costly; use the ring sdf on a
  // grid, with a box grid of the ring segments to keep it fast.
  const segs: number[][] = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const [a, b] = [r[i], r[(i + 1) % r.length]];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  const B = 8; // bucket px
  const bx = Math.ceil((nx * cell) / B) + 1,
    by = Math.ceil((ny * cell) / B) + 1;
  const buckets: number[][] = Array.from({ length: bx * by }, () => []);
  segs.forEach((s, k) => {
    const i0 = Math.floor((Math.min(s[0], s[2]) - ox) / B),
      i1 = Math.floor((Math.max(s[0], s[2]) - ox) / B),
      j0 = Math.floor((Math.min(s[1], s[3]) - oy) / B),
      j1 = Math.floor((Math.max(s[1], s[3]) - oy) / B);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) buckets[j * bx + i].push(k);
  });
  const f = new Float64Array(nx * ny);
  const cap = 4 * sigma + 4; // distances past this are clamped (blur reach)
  const insideRow = new Uint8Array(nx);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = ox + i * cell,
        y = oy + j * cell;
      if (i === 0) {
        // even-odd parity along the row, from the ring crossings
        insideRow.fill(0);
        const xs: number[] = [];
        for (const r of rings)
          for (let q = 0; q < r.length; q++) {
            const [a, b] = [r[q], r[(q + 1) % r.length]];
            if (a[1] > y !== b[1] > y)
              xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
          }
        xs.sort((u, v) => u - v);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const i0 = Math.max(0, Math.ceil((xs[q] - ox) / cell)),
            i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - ox) / cell));
          for (let ii = i0; ii <= i1; ii++) insideRow[ii] = 1;
        }
      }
      let d = cap;
      const R = Math.ceil(cap / B);
      const ci = Math.floor((x - ox) / B),
        cj = Math.floor((y - oy) / B);
      for (let jj = Math.max(0, cj - R); jj <= Math.min(by - 1, cj + R); jj++)
        for (let ii = Math.max(0, ci - R); ii <= Math.min(bx - 1, ci + R); ii++)
          for (const k of buckets[jj * bx + ii]) {
            const s = segs[k];
            d = Math.min(d, segDist(x, y, s[0], s[1], s[2], s[3]));
          }
      f[j * nx + i] = insideRow[i] ? -d : d;
    }
  // separable Gaussian
  const sg = sigma / cell,
    J = Math.ceil(3 * sg);
  const w: number[] = [];
  let z = 0;
  for (let k = -J; k <= J; k++) {
    w.push(Math.exp(-(k * k) / (2 * sg * sg)));
    z += w[k + J];
  }
  const tmp = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = -J; k <= J; k++) {
        const ii = Math.max(0, Math.min(nx - 1, i + k));
        s += w[k + J] * f[j * nx + ii];
      }
      tmp[j * nx + i] = s / z;
    }
  const g = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = -J; k <= J; k++) {
        const jj = Math.max(0, Math.min(ny - 1, j + k));
        s += w[k + J] * tmp[jj * nx + i];
      }
      g[j * nx + i] = s / z;
    }
  // the level: the largest blurred value on any keep-in capsule's boundary
  const sample = (x: number, y: number) => {
    const fx = (x - ox) / cell,
      fy = (y - oy) / cell;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))),
      j = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = fx - i,
      ty = fy - j;
    const v = (a: number, b: number) => g[b * nx + a];
    return (
      v(i, j) * (1 - tx) * (1 - ty) +
      v(i + 1, j) * tx * (1 - ty) +
      v(i, j + 1) * (1 - tx) * ty +
      v(i + 1, j + 1) * tx * ty
    );
  };
  let c = 0;
  for (const k of keep) {
    const ex = k.b[0] - k.a[0],
      ey = k.b[1] - k.a[1];
    const L = Math.hypot(ex, ey);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let t = 0; t <= n; t++) {
      const cx = k.a[0] + (ex * t) / n,
        cy = k.a[1] + (ey * t) / n;
      for (let q = 0; q < 48; q++) {
        const a = (q / 48) * 2 * Math.PI;
        c = Math.max(
          c,
          sample(cx + k.R * Math.cos(a), cy + k.R * Math.sin(a)) + 0.05
        );
      }
    }
  }
  return contour(g, nx, ny, cell, ox, oy, c);
}

/** The signed distance from p to a ring set (negative inside). */
function sdfRings(rings: Pt[][], p: Pt): number {
  return ringsSdf(rings, p[0], p[1]);
}

/** The least outward offset that holds every keep-in capsule: the most
 *  any capsule's axis sample (every 2 px) needs, signed distance to the
 *  rings (negative inside, nonzero winding) plus its radius. The distances
 *  from a segment grid (exact, as the brute-force sdf it replaces). */
function needed(rings: Pt[][], keep: KeepIn[]): number {
  if (!keep.length) return 0;
  const S = segsOf(rings);
  const G = new SegGrid(S, 4),
    In = new Inside(S);
  let c = -Infinity;
  for (const k of keep) {
    const L = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let t = 0; t <= n; t++) {
      const x = k.a[0] + ((k.b[0] - k.a[0]) * t) / n,
        y = k.a[1] + ((k.b[1] - k.a[1]) * t) / n;
      const d = G.nearest(x, y)[0];
      c = Math.max(c, (In.has(x, y) ? -d : d) + k.R);
    }
  }
  return Math.max(0, c);
}

export function blur(
  rings: Pt[][],
  keep: KeepIn[],
  sigma: number,
  margin = 0.05
): Pt[][] {
  const sm = rings.map((ring) => gauss(resample(ring, 1), sigma));
  const c = needed(sm, keep) + margin;
  return sm.map((r) => {
    const N = normals(r, true);
    return r.map((p, i) => [p[0] + c * N[i][0], p[1] + c * N[i][1]] as Pt);
  });
}

/** The blur, but the outward offset is local: each keep-in capsule the
 *  smoothed outline cuts pushes the outline out where it is nearest, by what
 *  it needs, tapering as a Gaussian of width `width` px along the outline
 *  (the pushes combine by max). Repeated until every capsule is held. */
export function blurLocal(
  rings: Pt[][],
  keep: KeepIn[],
  sigma: number,
  width: number
): Pt[][] {
  let sm = rings.map((ring) => gauss(resample(ring, 1), sigma));
  for (let round = 0; round < 6; round++) {
    const off = sm.map((r) => new Float64Array(r.length));
    let any = false;
    for (const k of keep) {
      const L = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
      const n = Math.max(1, Math.ceil(L / 2));
      for (let t = 0; t <= n; t++) {
        const p: Pt = [
          k.a[0] + ((k.b[0] - k.a[0]) * t) / n,
          k.a[1] + ((k.b[1] - k.a[1]) * t) / n,
        ];
        const need = sdfRings(sm, p) + k.R + 0.05;
        if (need <= 0.01) continue;
        any = true;
        // the nearest outline sample
        let best = Infinity,
          bi = 0,
          bj = 0;
        sm.forEach((r, ri) =>
          r.forEach((q, qi) => {
            const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if (d < best) [best, bi, bj] = [d, ri, qi];
          })
        );
        const r = sm[bi],
          o = off[bi],
          N = r.length;
        const J = Math.min(N >> 1, Math.ceil(3 * width));
        for (let j = -J; j <= J; j++) {
          const i = (((bj + j) % N) + N) % N;
          o[i] = Math.max(
            o[i],
            need * Math.exp(-(j * j) / (2 * width * width))
          );
        }
      }
    }
    if (!any) break;
    sm = sm.map((r, ri) => {
      const N = normals(r);
      return r.map(
        (p, i) =>
          [p[0] + off[ri][i] * N[i][0], p[1] + off[ri][i] * N[i][1]] as Pt
      );
    });
  }
  return sm;
}

export function smoothOutline(
  rings: Pt[][],
  keep: KeepIn[],
  spec: SmoothSpec
): Pt[][] {
  if (spec.kind === "field") return field(rings, keep, spec.sigma, spec.cell);
  if (spec.kind === "blur")
    return spec.local
      ? blurLocal(rings, keep, spec.sigma, spec.local)
      : blur(rings, keep, spec.sigma, spec.margin);
  return rings.map((ring) => {
    const own = keep.filter((k) => pointInRing(k.a, ring));
    return spec.kind === "relax"
      ? relax(ring, own, spec.sigma, spec.iters)
      : outward(ring, own, spec.sigma, spec.iters);
  });
}

/** Resample a closed ring at about ds, each sample marked when the edge it
 *  lies on has a marked end. */
function resampleMarked(
  ring: Pt[],
  mk: boolean[],
  ds: number
): [Pt[], boolean[]] {
  const n = ring.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % n]];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n];
  const m = Math.max(8, Math.round(L / ds));
  const out: Pt[] = [],
    om: boolean[] = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const s = (L * j) / m;
    while (cum[k + 1] < s) k++;
    const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const [a, b] = [ring[k], ring[(k + 1) % n]];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    om.push(mk[k] || mk[(k + 1) % n]);
  }
  return [out, om];
}

/**
 * PROTOTYPE: the rounding of the corners a cut leaves (unified.ts, finish).
 * Near the cut (`marks`: the points that came from the forbidden region's
 * boundary), each point moves by the inward part of a Gaussian along
 * arclength (sigma px) and no further: convex corners and spikes (where the
 * outline meets a clipped side or a keep-out, or two keep-outs meet) round
 * off; nothing moves outward, and no point moves out of the cut rings (a
 * move that would cross a band thinner than itself is halved until it
 * does not, or dropped), so the rounded outline stays inside the cut one
 * and out of what was cut. Then every point is pushed out of the
 * padded members again (pushOut), so they stay inside. The weight is 1
 * within 3σ of a cut point and tapers to 0 over the next 3σ, so the rest of
 * the outline does not move. A ring the rounding turns inside out was
 * narrower than the rounding (an opening would remove it too): dropped.
 */
export function roundCut(
  rings: Pt[][],
  marks: boolean[][],
  keep: KeepIn[],
  sigma: number
): Pt[][] {
  const out: Pt[][] = [];
  let region: Inside | null = null;
  rings.forEach((ring, ri) => {
    const mk0 = marks[ri];
    if (sigma <= 0 || ring.length < 3 || !mk0.some((x) => x)) {
      out.push(ring);
      return;
    }
    const [r, mk] = resampleMarked(ring, mk0, 1);
    const n = r.length;
    // samples to the nearest mark, around the ring
    const dist = new Float64Array(n).fill(Infinity);
    for (let pass = 0; pass < 2; pass++) {
      let d = Infinity;
      for (let q = 0; q < 2 * n; q++) {
        const i = q % n;
        d = mk[i] ? 0 : d + 1;
        if (d < dist[i]) dist[i] = d;
      }
      d = Infinity;
      for (let q = 2 * n - 1; q >= 0; q--) {
        const i = q % n;
        d = mk[i] ? 0 : d + 1;
        if (d < dist[i]) dist[i] = d;
      }
    }
    const W = 3 * sigma;
    const g = gauss(r, sigma);
    const N = normals(r, true);
    const res = r.map((p, i) => {
      const w = dist[i] <= W ? 1 : dist[i] >= 2 * W ? 0 : 2 - dist[i] / W;
      if (w <= 0) return p;
      const t = (g[i][0] - p[0]) * N[i][0] + (g[i][1] - p[1]) * N[i][1];
      if (t >= 0) return p;
      region ??= new Inside(segsOf(rings));
      let s = w * t;
      for (let k = 0; k < 4; k++, s /= 2) {
        const q: Pt = [p[0] + s * N[i][0], p[1] + s * N[i][1]];
        if (region.has(q[0], q[1])) return pushOut(q, keep);
      }
      return pushOut(p, keep);
    });
    const a0 = signedArea2(ring),
      a1 = signedArea2(res);
    if (Math.sign(a1) !== Math.sign(a0) || Math.abs(a1) < 1e-6) return;
    out.push(res);
  });
  return out;
}
