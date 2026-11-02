/**
 * PROTOTYPE (scratch, not for merge): `convexity` above 1, rounder than the
 * padded convex hull. Four ways from the padded hull H (c = 1) to a round
 * limit (c = 2), all convex and all holding H:
 *
 *  - "ellipse" (main candidate): the Minkowski combination
 *      (2 − c)·H ⊕ (c − 1)·E,   E = the `Shape.oval()` outline,
 *    whose support function is h_c = (2 − c)·h_H + (c − 1)·h_E. Every point
 *    of H is in E, so p = (2 − c)p + (c − 1)p lies in it: it holds H. It is
 *    H at 1 and E at 2, and nested in c (h_E ≥ h_H, so h_c grows with c).
 *  - "circle": the same with E the minimum enclosing circle of H.
 *  - "corner": the padded hull with its corner radius grown from padding
 *    (c = 1) to the minimum enclosing circle's radius (c = 2): the opening
 *    of H ⊕ D_t by the disc D_R, t the least offset that holds H again.
 *  - "firey": Firey's L^p combination about E's center, p = 4:
 *      h_c = ((2 − c)·h_H^p + (c − 1)·h_E^p)^(1/p),
 *    a support function for p ≥ 1 (the origin inside both).
 */
import { packEnclose } from "d3-hierarchy";
import { signedArea2, pointInRing } from "../../geometry/plane";
import type { Pt } from "./blob";
import { ellipseLoop, minEllipse, paddedHull as ovalHull } from "./oval";
import type { BlobMember } from "./blob";

export type Beyond = "ellipse" | "circle" | "corner" | "firey";

const ccw = (r: Pt[]) => (signedArea2(r) > 0 ? r : r.slice().reverse());

/** Drop repeated and collinear vertices of a convex ring. */
function clean(r: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of r) {
    const q = out.at(-1);
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9) continue;
    out.push(p);
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) < 1e-9
  )
    out.pop();
  return out;
}

/** The Minkowski sum a·P ⊕ b·Q of two convex rings (edge merge). */
export function minkowski(P0: Pt[], a: number, Q0: Pt[], b: number): Pt[] {
  if (b <= 0) return P0.map(([x, y]) => [a * x, a * y]);
  if (a <= 0) return Q0.map(([x, y]) => [b * x, b * y]);
  const prep = (R: Pt[], s: number) => {
    const r = clean(ccw(R)).map(([x, y]): Pt => [s * x, s * y]);
    // start at the lowest y, then lowest x
    let k = 0;
    for (let i = 1; i < r.length; i++)
      if (r[i][1] < r[k][1] || (r[i][1] === r[k][1] && r[i][0] < r[k][0]))
        k = i;
    return [...r.slice(k), ...r.slice(0, k)];
  };
  const P = prep(P0, a),
    Q = prep(Q0, b);
  const n = P.length,
    m = Q.length;
  const out: Pt[] = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    out.push([P[i % n][0] + Q[j % m][0], P[i % n][1] + Q[j % m][1]]);
    const ep = [P[(i + 1) % n][0] - P[i % n][0], P[(i + 1) % n][1] - P[i % n][1]];
    const eq = [Q[(j + 1) % m][0] - Q[j % m][0], Q[(j + 1) % m][1] - Q[j % m][1]];
    const cr = ep[0] * eq[1] - ep[1] * eq[0];
    if (j >= m || (i < n && cr > 0)) i++;
    else if (i >= n || cr < 0) j++;
    else {
      i++;
      j++;
    }
  }
  return clean(out);
}

/** The `Shape.oval()` ellipse's outline (the same 128-gon `ovalOutline`
 *  draws), or undefined for flat members. */
export function ovalRing(members: BlobMember[], pad: number): Pt[] | undefined {
  const h = ovalHull(members, pad);
  if (h.length < 3 || Math.abs(signedArea2(h)) < 1e-6) return undefined;
  return ccw(ellipseLoop(minEllipse(h)));
}

/** The minimum enclosing circle of a ring, as a 128-gon drawn around it. */
export function circleRing(H: Pt[], k = 128): Pt[] {
  const e = packEnclose(H.map(([x, y]) => ({ x, y, r: 0 })));
  const out = 1 / Math.cos(Math.PI / k);
  return Array.from({ length: k }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / k;
    return [e.x + e.r * out * Math.cos(t), e.y + e.r * out * Math.sin(t)];
  });
}

/** Half-plane intersection: the convex ring P shifted inward by d on every
 *  edge (its inner parallel body), by clipping. */
function erode(P: Pt[], d: number): Pt[] {
  let cur = P;
  const n = P.length;
  for (let i = 0; i < n && cur.length > 0; i++) {
    const [a, b] = [P[i], P[(i + 1) % n]];
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const L = Math.hypot(ex, ey);
    if (L < 1e-9) continue;
    const [nx, ny] = [-ey / L, ex / L]; // inward for ccw
    const f = (p: Pt) => (p[0] - a[0]) * nx + (p[1] - a[1]) * ny - d;
    const next: Pt[] = [];
    for (let k = 0; k < cur.length; k++) {
      const p = cur[k],
        q = cur[(k + 1) % cur.length];
      const fp = f(p),
        fq = f(q);
      if (fp >= 0) next.push(p);
      if (fp * fq < 0) {
        const t = fp / (fp - fq);
        next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    cur = next;
  }
  return cur;
}

const discRing = (R: number, k = 64): Pt[] =>
  Array.from({ length: k }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / k,
      out = 1 / Math.cos(Math.PI / k);
    return [R * out * Math.cos(t), R * out * Math.sin(t)];
  });

/** The convex ring P, its corners rounded to radius R, grown the least that
 *  holds every vertex of P again. */
function cornerRounded(P: Pt[], R: number, pad: number): Pt[] {
  const D = (r: number) => discRing(r, 96);
  const open = (t: number) => {
    const K = erode(t > 0 ? minkowski(P, 1, D(t), 1) : P, R);
    if (K.length === 0) return undefined;
    return minkowski(K.length < 3 ? [...K, K[0], K[0]] : K, 1, D(R), 1);
  };
  const holds = (S: Pt[] | undefined) =>
    S !== undefined && P.every((p) => pointInRing(p, S) || near(p, S));
  if (R <= pad + 1e-6) return P;
  let lo = 0,
    hi = Math.max(1, R - pad);
  while (!holds(open(hi))) hi *= 2;
  for (let k = 0; k < 24 && hi - lo > 0.05; k++) {
    const mid = (lo + hi) / 2;
    if (holds(open(mid))) hi = mid;
    else lo = mid;
  }
  return open(hi)!;
}
const near = (p: Pt, S: Pt[]) => {
  for (let i = 0; i < S.length; i++) {
    const a = S[i],
      b = S[(i + 1) % S.length];
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const L2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2));
    if (Math.hypot(a[0] + t * ex - p[0], a[1] + t * ey - p[1]) < 1e-3) return true;
  }
  return false;
};

/** Firey's L^p combination of H and E about E's center, sampled at `k`
 *  directions and drawn as the intersection of the support half-planes
 *  (the polygon around the shape). */
function firey(H: Pt[], E: Pt[], c: number, p: number, k = 720): Pt[] {
  const o = E.reduce((s, q) => [s[0] + q[0] / E.length, s[1] + q[1] / E.length], [0, 0]);
  const h = (R: Pt[], ux: number, uy: number) =>
    R.reduce((m, q) => Math.max(m, (q[0] - o[0]) * ux + (q[1] - o[1]) * uy), -Infinity);
  const hs: number[] = [];
  for (let i = 0; i < k; i++) {
    const t = (2 * Math.PI * i) / k,
      ux = Math.cos(t),
      uy = Math.sin(t);
    const a = Math.max(0, h(H, ux, uy)),
      b = Math.max(0, h(E, ux, uy));
    hs.push(((2 - c) * a ** p + (c - 1) * b ** p) ** (1 / p));
  }
  // vertices: intersections of consecutive support lines
  const out: Pt[] = [];
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    const t1 = (2 * Math.PI * i) / k,
      t2 = (2 * Math.PI * j) / k;
    const [a1, b1, c1] = [Math.cos(t1), Math.sin(t1), hs[i]];
    const [a2, b2, c2] = [Math.cos(t2), Math.sin(t2), hs[j]];
    const det = a1 * b2 - a2 * b1;
    out.push([o[0] + (c1 * b2 - c2 * b1) / det, o[1] + (a1 * c2 - a2 * c1) / det]);
  }
  return out;
}

/** The outline for convexity c in (1, 2] from the padded hull H. */
export function beyondHull(
  H: Pt[],
  members: BlobMember[],
  pad: number,
  c: number,
  how: Beyond = "ellipse"
): Pt[] {
  const s = Math.max(0, Math.min(1, c - 1));
  const Hc = ccw(H);
  if (how === "corner") {
    const C = circleRing(Hc);
    const Rc = Math.hypot(C[0][0] - mean(C)[0], C[0][1] - mean(C)[1]);
    return cornerRounded(Hc, pad + s * (Rc - pad), pad);
  }
  const E =
    how === "circle" ? circleRing(Hc) : (ovalRing(members, pad) ?? Hc);
  if (how === "firey") return firey(Hc, E, c, 4);
  return minkowski(Hc, 1 - s, E, s);
}
const mean = (R: Pt[]): Pt =>
  R.reduce((s, q) => [s[0] + q[0] / R.length, s[1] + q[1] / R.length], [0, 0]);
