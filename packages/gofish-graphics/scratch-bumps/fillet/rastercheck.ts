// SCRATCH: an outline against a raster closing of the padded union.
// f(p) = dist(p, S) − r, S = { c : d_X(c) ≥ r } (centres of r-discs clear of the padded union X);
// the closing is { f ≥ 0 }. Raster: S on a grid of spacing h, dist by brute force over S's
// boundary cells near p.
import type {
  BlobMember,
  Pt,
} from "../../src/ast/graphicalOperators/enclose/blob";
import {
  grownPrim,
  primD,
} from "../../src/ast/graphicalOperators/enclose/blob";
import { signedArea2, segDist } from "../../src/ast/geometry/plane";

export function rasterClosing(
  members: BlobMember[],
  pad: number,
  r: number,
  h = 0.1
) {
  const prims = members.map((m) => grownPrim(m, pad));
  // buckets of C px: the prims whose box comes within r + C of the bucket (a prim farther
  // than r only says dX ≥ r, which is all the raster asks)
  const C = 8;
  const buckets = new Map<string, typeof prims>();
  const reachB = r + C;
  for (const p of prims) {
    const [a, b, c, d] = p.bb;
    for (
      let j = Math.floor((b - reachB) / C);
      j <= Math.floor((d + reachB) / C);
      j++
    )
      for (
        let i = Math.floor((a - reachB) / C);
        i <= Math.floor((c + reachB) / C);
        i++
      ) {
        const k = `${i},${j}`;
        let L = buckets.get(k);
        if (!L) buckets.set(k, (L = []));
        L.push(p);
      }
  }
  const dX = (x: number, y: number) => {
    let d = Infinity;
    for (const p of buckets.get(`${Math.floor(x / C)},${Math.floor(y / C)}`) ??
      [])
      d = Math.min(d, primD(p, x, y, false));
    return d;
  };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    x0 = Math.min(x0, p.bb[0]);
    y0 = Math.min(y0, p.bb[1]);
    x1 = Math.max(x1, p.bb[2]);
    y1 = Math.max(y1, p.bb[3]);
  }
  const m = 2 * r + 4;
  x0 -= m;
  y0 -= m;
  x1 += m;
  y1 += m;
  const nx = Math.ceil((x1 - x0) / h) + 1,
    ny = Math.ceil((y1 - y0) / h) + 1;
  const inS = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      inS[j * nx + i] = dX(x0 + i * h, y0 + j * h) >= r ? 1 : 0;
  const bd: Pt[] = [];
  for (let j = 1; j < ny - 1; j++)
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (
        inS[k] &&
        (!inS[k - 1] || !inS[k + 1] || !inS[k - nx] || !inS[k + nx])
      )
        bd.push([x0 + i * h, y0 + j * h]);
    }
  const B = r + 2;
  const grid = new Map<string, Pt[]>();
  for (const p of bd) {
    const kk = `${Math.floor(p[0] / B)},${Math.floor(p[1] / B)}`;
    let a = grid.get(kk);
    if (!a) grid.set(kk, (a = []));
    a.push(p);
  }
  const distS = (x: number, y: number) => {
    const i = Math.round((x - x0) / h),
      j = Math.round((y - y0) / h);
    // off the grid (or on its border row) is at least 2r + 4 from X: in S
    if (i <= 0 || j <= 0 || i >= nx - 1 || j >= ny - 1) return 0;
    if (inS[j * nx + i]) return 0;
    let d = Infinity;
    const gx = Math.floor(x / B),
      gy = Math.floor(y / B);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const p of grid.get(`${gx + a},${gy + b}`) ?? [])
          d = Math.min(d, Math.hypot(p[0] - x, p[1] - y));
    return d;
  };
  const f = (x: number, y: number) => Math.min(distS(x, y), r + 1.5) - r;
  return { f, dX, box: [x0, y0, x1, y1] as const };
}

/** Boundary error of rings against the raster closing, both ways (px):
 *  outToTrue: max |f| over the rings' points; trueToOut: over the raster closing's boundary
 *  (sign changes of f on a grid of spacing g), the distance to the rings. */
export function closingError(
  rings: Pt[][],
  members: BlobMember[],
  pad: number,
  r: number,
  h = 0.1,
  g = 0.5
) {
  const R = rasterClosing(members, pad, r, h);
  let e1 = 0;
  let at1: Pt = [0, 0];
  for (const ring of rings)
    for (const p of ring) {
      const v = Math.abs(R.f(p[0], p[1]));
      if (v > e1) [e1, at1] = [v, p];
    }
  const [x0, y0, x1, y1] = R.box;
  const nx = Math.ceil((x1 - x0) / g),
    ny = Math.ceil((y1 - y0) / g);
  const F = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++)
      F[j * (nx + 1) + i] = R.f(x0 + i * g, y0 + j * g);
  const segs: [Pt, Pt][] = [];
  for (const ring of rings)
    for (let k = 0; k < ring.length; k++)
      segs.push([ring[k], ring[(k + 1) % ring.length]]);
  let e2 = 0;
  let at2: Pt = [0, 0];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = F[j * (nx + 1) + i],
        b = F[j * (nx + 1) + i + 1],
        c = F[(j + 1) * (nx + 1) + i];
      for (const [v, w, dx, dy] of [
        [a, b, 1, 0],
        [a, c, 0, 1],
      ] as const) {
        if (v >= 0 === w >= 0) continue;
        const t = v / (v - w);
        const p: Pt = [x0 + (i + t * dx) * g, y0 + (j + t * dy) * g];
        let d = Infinity;
        for (const [s, e] of segs)
          d = Math.min(d, segDist(p[0], p[1], s[0], s[1], e[0], e[1]));
        if (d > e2) [e2, at2] = [d, p];
      }
    }
  return { outToTrue: e1, at1, trueToOut: e2, at2 };
}

/** The sharpest convex turn of rings in degrees, over ±k px (a cusp: near 180). */
export function sharpest(rings: Pt[][], step = 0.25, k = 1) {
  let worst = 0;
  let at: Pt = [0, 0];
  for (const ring0 of rings) {
    const outer = signedArea2(ring0) > 0;
    const ring: Pt[] = [];
    for (let i = 0; i < ring0.length; i++) {
      const a = ring0[i],
        b = ring0[(i + 1) % ring0.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s < n; s++)
        ring.push([
          a[0] + ((b[0] - a[0]) * s) / n,
          a[1] + ((b[1] - a[1]) * s) / n,
        ]);
    }
    const n = ring.length;
    const kk = Math.max(1, Math.round(k / step));
    if (n < 4 * kk) continue;
    for (let i = 0; i < n; i++) {
      const p = ring[(i - kk + n) % n],
        q = ring[i],
        s = ring[(i + kk) % n];
      const t1 = Math.atan2(q[1] - p[1], q[0] - p[0]),
        t2 = Math.atan2(s[1] - q[1], s[0] - q[0]);
      let d = t2 - t1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const deg = ((outer ? d : -d) * 180) / Math.PI;
      if (deg > worst) [worst, at] = [deg, q];
    }
  }
  return { deg: worst, at };
}
